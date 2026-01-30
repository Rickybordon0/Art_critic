import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function Visitor({ slugOverride }) {
    const [searchParams] = useSearchParams();
    const paintingId = searchParams.get('id');
    const paintingSlug = searchParams.get('slug');

    const [painting, setPainting] = useState(null);
    const [status, setStatus] = useState('loading'); // loading, ready, connecting, connected, error
    const [errorMsg, setErrorMsg] = useState('');
    const [logs, setLogs] = useState([]);

    const pcRef = useRef(null);
    const dcRef = useRef(null);
    const audioRef = useRef(null);

    const addLog = (msg) => {
        console.log(msg);
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
    };

    // Fetch Painting Details
    useEffect(() => {
        if (slugOverride) {
            fetchPainting(`${import.meta.env.VITE_API_URL}/api/paintings/slug/${slugOverride}`);
            return;
        }

        if (!paintingId && !paintingSlug) {
            setStatus('error');
            setErrorMsg('No painting ID or Slug found in URL.');
            return;
        }

        let fetchUrl;
        if (paintingId) {
            fetchUrl = `${import.meta.env.VITE_API_URL}/api/paintings/${paintingId}`;
        } else if (paintingSlug) {
            fetchUrl = `${import.meta.env.VITE_API_URL}/api/paintings/slug/${paintingSlug}`;
        }

        fetchPainting(fetchUrl);

        return () => {
            if (pcRef.current) pcRef.current.close();
        };
    }, [paintingId, paintingSlug, slugOverride]);

    const fetchPainting = (url) => {
        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error('Painting not found');
                return res.json();
            })
            .then(data => {
                setPainting(data);
                setStatus('ready');
            })
            .catch(err => {
                setStatus('error');
                setErrorMsg(err.message);
            });
    };

    const startConversation = async () => {
        try {
            setStatus('connecting');
            addLog('Starting WebRTC connection...');

            // 1. Get ephemeral token from server
            const queryParam = painting.slug ? `slug=${painting.slug}` : `paintingId=${painting.id}`;
            addLog('Requesting ephemeral token...');
            const tokenRes = await fetch(`${import.meta.env.VITE_API_URL}/api/session?${queryParam}`);
            const tokenData = await tokenRes.json();

            if (!tokenData.client_secret || !tokenData.client_secret.value) {
                throw new Error('Failed to get ephemeral token');
            }
            const EPHEMERAL_KEY = tokenData.client_secret.value;
            addLog('✓ Ephemeral token received');

            // 2. Setup WebRTC Peer Connection
            const pc = new RTCPeerConnection();
            pcRef.current = pc;

            // Event handlers
            pc.oniceconnectionstatechange = () => addLog(`ICE State: ${pc.iceConnectionState}`);
            pc.onconnectionstatechange = () => {
                addLog(`Connection State: ${pc.connectionState}`);
                if (pc.connectionState === 'connected') {
                    setStatus('connected');
                }
            };

            // Handle incoming audio
            pc.ontrack = (event) => {
                addLog('✓ Received remote audio track');
                const audioEl = audioRef.current;
                if (audioEl && event.streams[0]) {
                    audioEl.srcObject = event.streams[0];
                    audioEl.play().catch(e => addLog(`Audio play error: ${e.message}`));
                }
            };

            // 3. Get user's microphone
            addLog('Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            addLog('✓ Microphone access granted');

            // Add microphone track to peer connection
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            // 4. Create data channel for events
            const dc = pc.createDataChannel('oai-events');
            dcRef.current = dc;

            dc.onopen = async () => {
                addLog('✓ Data channel opened');

                // Send session update with instructions
                addLog('Sending session instructions...');
                dc.send(JSON.stringify({
                    type: 'session.update',
                    session: {
                        modalities: ['text', 'audio'],
                        instructions: painting.systemInstructions,
                        voice: 'alloy',
                        input_audio_format: 'pcm16',
                        output_audio_format: 'pcm16',
                        turn_detection: {
                            type: 'server_vad',
                            threshold: 0.5,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 200
                        }
                    }
                }));

                // Send the painting image
                if (painting.imageUrl) {
                    addLog('Fetching painting image...');
                    try {
                        const imgRes = await fetch(painting.imageUrl);
                        const blob = await imgRes.blob();

                        // Detect format
                        let format = 'jpeg';
                        if (blob.type === 'image/png') format = 'png';

                        // Convert to base64
                        const base64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result.split(',')[1]);
                            reader.readAsDataURL(blob);
                        });

                        addLog(`✓ Image loaded (${format})`);

                        // Send image to model
                        dc.send(JSON.stringify({
                            type: 'conversation.item.create',
                            item: {
                                type: 'message',
                                role: 'user',
                                content: [
                                    {
                                        type: 'input_text',
                                        text: "Here is the painting I'm looking at. Please help me understand it."
                                    },
                                    {
                                        type: 'input_image',
                                        image: {
                                            format: format,
                                            data: base64
                                        }
                                    }
                                ]
                            }
                        }));

                        addLog('✓ Image sent to model');

                        // Request a response
                        dc.send(JSON.stringify({ type: 'response.create' }));
                        addLog('✓ Requested initial response');

                    } catch (e) {
                        addLog(`Image error: ${e.message}`);
                    }
                }
            };

            dc.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    // Log important events, skip audio deltas
                    if (!msg.type.includes('audio.delta') && !msg.type.includes('audio_transcript.delta')) {
                        addLog(`Event: ${msg.type}`);
                    }
                } catch (err) {
                    // Ignore parse errors
                }
            };

            dc.onerror = (e) => addLog(`Data channel error: ${e}`);
            dc.onclose = () => addLog('Data channel closed');

            // 5. Create and send offer
            addLog('Creating SDP offer...');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // 6. Send offer to OpenAI and get answer
            addLog('Sending offer to OpenAI...');
            const sdpResponse = await fetch('https://api.openai.com/v1/realtime?model=gpt-realtime', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${EPHEMERAL_KEY}`,
                    'Content-Type': 'application/sdp'
                },
                body: offer.sdp
            });

            if (!sdpResponse.ok) {
                const errorText = await sdpResponse.text();
                throw new Error(`SDP exchange failed: ${sdpResponse.status} - ${errorText}`);
            }

            const answerSdp = await sdpResponse.text();
            addLog('✓ Received SDP answer from OpenAI');

            // 7. Set remote description
            await pc.setRemoteDescription({
                type: 'answer',
                sdp: answerSdp
            });

            addLog('✓ WebRTC connection established!');

        } catch (err) {
            console.error('Connection error:', err);
            addLog(`ERROR: ${err.message}`);
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    const stopConversation = () => {
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        if (dcRef.current) {
            dcRef.current.close();
            dcRef.current = null;
        }
        setStatus('ready');
        addLog('Connection closed');
    };

    if (status === 'loading') return <div>Loading painting...</div>;
    if (status === 'error') return <div style={{ color: 'red' }}>Error: {errorMsg}</div>;

    return (
        <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
            <h1>{painting.title}</h1>
            <img
                src={painting.imageUrl}
                alt={painting.title}
                style={{ width: '100%', borderRadius: '8px', marginBottom: '20px' }}
            />

            <p style={{ fontStyle: 'italic', color: '#666' }}>{painting.description}</p>

            {status === 'ready' && (
                <button
                    onClick={startConversation}
                    style={{
                        padding: '15px 30px',
                        fontSize: '18px',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50px',
                        cursor: 'pointer'
                    }}
                >
                    Start Conversation
                </button>
            )}

            {status === 'connecting' && <p>Connecting to Expert...</p>}

            {status === 'connected' && (
                <div style={{ marginTop: '20px' }}>
                    <div style={{ padding: '15px', background: '#e0ffe0', borderRadius: '10px', marginBottom: '20px' }}>
                        <p>🟢 Connected</p>
                        <p>Speak now. The agent can see the painting.</p>
                    </div>

                    <button
                        onClick={stopConversation}
                        style={{
                            padding: '10px 20px',
                            fontSize: '16px',
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '25px',
                            cursor: 'pointer'
                        }}
                    >
                        End Conversation
                    </button>
                </div>
            )}

            {/* Audio element for AI responses */}
            <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

            {/* Debug Log */}
            <div style={{
                marginTop: '30px',
                textAlign: 'left',
                background: '#333',
                color: '#0f0',
                padding: '10px',
                borderRadius: '5px',
                fontSize: '12px',
                height: '200px',
                overflowY: 'scroll'
            }}>
                <strong>Debug Logs:</strong>
                {logs.map((log, i) => <div key={i}>{log}</div>)}
            </div>
        </div>
    );
}