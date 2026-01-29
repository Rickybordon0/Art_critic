import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function Visitor({ slugOverride }) {
    const [searchParams] = useSearchParams();
    // Logic: Look for "id" param OR "slug" param
    // If neither, we could check window.location.hostname for a subdomain slug
    // For now, let's look for explicit params
    const paintingId = searchParams.get('id');
    const paintingSlug = searchParams.get('slug');

    const [painting, setPainting] = useState(null);
    const [status, setStatus] = useState('loading'); // loading, ready, connected, error
    const [errorMsg, setErrorMsg] = useState('');
    const [logs, setLogs] = useState([]); // On-screen logs

    const pcRef = useRef(null);
    const audioRef = useRef(null);

    const addLog = (msg) => {
        console.log(msg);
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
    };

    useEffect(() => {
        if (slugOverride) {
            // If subdomain override exists, use it immediately
            fetch(`${import.meta.env.VITE_API_URL}/api/paintings/slug/${slugOverride}`)
                .then(res => {
                    if (!res.ok) throw new Error('Painting not found for subdomain');
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
            return;
        }

        if (!paintingId && !paintingSlug) {
            // Optional: fallback to subdomain check
            // const parts = window.location.hostname.split('.');
            // if (parts.length > 2) { 
            //    // e.g. monalisa.art-expert.com -> fetch by slug 'monalisa'
            // }

            setStatus('error');
            setErrorMsg('No painting ID or Slug found in URL.');
            return;
        }

        // Determine Fetch URL
        let fetchUrl;
        if (paintingId) {
            fetchUrl = `${import.meta.env.VITE_API_URL}/api/paintings/${paintingId}`;
        } else if (paintingSlug) {
            fetchUrl = `${import.meta.env.VITE_API_URL}/api/paintings/slug/${paintingSlug}`;
        }

        // Fetch painting details
        fetch(fetchUrl)
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

        // Cleanup on unmount
        return () => {
            if (pcRef.current) pcRef.current.close();
        };
    }, [paintingId, paintingSlug]);

    const startConversation = async () => {
        try {
            setStatus('connecting');
            addLog('Starting connection flow...');

            // 1. Get Ephemeral Token
            addLog('Fetching ephemeral token...');
            const tokenRes = await fetch(`${import.meta.env.VITE_API_URL}/api/session`);
            const tokenData = await tokenRes.json();

            if (!tokenData.client_secret || !tokenData.client_secret.value) {
                throw new Error('Failed to get ephemeral token');
            }
            const EPHEMERAL_KEY = tokenData.client_secret.value;
            addLog('Ephemeral token received.');

            // 2. Initialize WebRTC
            const pc = new RTCPeerConnection();
            pcRef.current = pc;

            pc.onconnectionstatechange = () => addLog(`PC State: ${pc.connectionState}`);
            pc.onsignalingstatechange = () => addLog(`Signaling State: ${pc.signalingState}`);
            pc.oniceconnectionstatechange = () => addLog(`ICE State: ${pc.iceConnectionState}`);

            // Setup Audio Element for remote stream
            const audioEl = audioRef.current;
            pc.ontrack = (e) => {
                addLog(`Received audio track: ${e.streams[0].id}`);
                audioEl.srcObject = e.streams[0];
                audioEl.play().catch(e => addLog(`Autoplay failed: ${e.message}`));
            };

            // Add local microphone
            const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
            addLog('Microphone acquired.');
            pc.addTrack(ms.getTracks()[0]);

            // Data Channel (Required for events)
            const dc = pc.createDataChannel('oai-events');
            dc.onopen = () => {
                addLog('Data Channel OPEN! Sending initial instructions...');

                const sessionUpdate = {
                    type: "session.update",
                    session: {
                        instructions: painting.systemInstructions,
                        voice: "alloy",
                        modalities: ["text", "audio"] // Explicitly requesting audio
                    }
                };
                dc.send(JSON.stringify(sessionUpdate));

                // Force a response to test audio
                setTimeout(() => {
                    addLog('Sending forced "Say Hello" command...');
                    dc.send(JSON.stringify({
                        type: "response.create",
                        response: {
                            modalities: ["text", "audio"],
                            instructions: "Say 'Hello, I am ready to talk about this painting' clearly."
                        }
                    }));
                }, 1000);
            };

            dc.onclose = () => addLog('Data Channel CLOSED');
            dc.onerror = (err) => addLog(`Data Channel Error: ${err}`);

            dc.onmessage = (e) => {
                const msg = JSON.parse(e.data);
                if (msg.type === 'response.audio.delta') return; // Ignore spam
                addLog(`Received Event: ${msg.type}`);
            };

            // 3. Offer / Answer handshake
            addLog('Creating Offer...');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const baseUrl = "https://api.openai.com/v1/realtime";
            const model = "gpt-4o-realtime-preview-2024-12-17";

            addLog('Sending SDP to OpenAI...');
            const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
                method: "POST",
                body: offer.sdp,
                headers: {
                    Authorization: `Bearer ${EPHEMERAL_KEY}`,
                    "Content-Type": "application/sdp"
                },
            });

            const answerSdp = await sdpResponse.text();
            addLog('Received Answer SDP from OpenAI');

            const answer = {
                type: "answer",
                sdp: answerSdp
            };
            await pc.setRemoteDescription(answer);

            setStatus('connected');

        } catch (err) {
            console.error(err);
            addLog(`ERROR: ${err.message}`);
            setStatus('error');
            setErrorMsg(err.message);
        }
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
                <div style={{ marginTop: '20px', padding: '15px', background: '#e0ffe0', borderRadius: '10px' }}>
                    <p>🟢 Connected</p>
                    <p>Speak now.</p>
                </div>
            )}

            {/* Audio Element with controls */}
            <audio ref={audioRef} autoPlay controls style={{ marginTop: '20px', width: '100%' }} />

            {/* Visual Debug Log */}
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
                {logs.map((L, i) => <div key={i}>{L}</div>)}
            </div>
        </div>
    );
}
