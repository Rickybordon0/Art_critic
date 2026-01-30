import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RealtimeAgent, RealtimeSession } from "@openai/agents-realtime";

export default function Visitor({ slugOverride }) {
    const [searchParams] = useSearchParams();
    const paintingId = searchParams.get('id');
    const paintingSlug = searchParams.get('slug');

    const [painting, setPainting] = useState(null);
    const [status, setStatus] = useState('loading'); // loading, ready, connected, error
    const [errorMsg, setErrorMsg] = useState('');
    const [logs, setLogs] = useState([]);

    // Refs to hold SDK instances
    const sessionRef = useRef(null);
    const agentRef = useRef(null);

    const addLog = (msg) => {
        console.log(msg);
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
    };

    // 1. Fetch Painting Details
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
            if (sessionRef.current) sessionRef.current.close();
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

    // 2. Helper to convert image URL to Base64
    const urlToBase64 = async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Remove the "data:image/jpeg;base64," prefix
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    // 3. Start Conversation using SDK
    const startConversation = async () => {
        try {
            setStatus('connecting');
            addLog('Starting connection flow...');

            // A. Get Ephemeral Token
            // We pass the painting ID/slug so the server can inject the correct system instructions
            const queryParam = painting.slug ? `slug=${painting.slug}` : `id=${painting.id}`;
            const tokenRes = await fetch(`${import.meta.env.VITE_API_URL}/api/session?${queryParam}`);
            const tokenData = await tokenRes.json();

            if (!tokenData.client_secret || !tokenData.client_secret.value) {
                throw new Error('Failed to get ephemeral token');
            }
            const EPHEMERAL_KEY = tokenData.client_secret.value;
            addLog('Ephemeral token received.');

            // B. Initialize SDK
            const agent = new RealtimeAgent({
                name: "Art Critic",
                // Instructions are already set on the server session, 
                // but we can add client-side tools here if needed.
            });
            agentRef.current = agent;

            // Model is already configured server-side when creating the ephemeral token
            const session = new RealtimeSession(agent);
            sessionRef.current = session;

            // Event Listeners
            session.on("error", (event) => {
                addLog(`SDK Error: ${JSON.stringify(event)}`);
            });

            session.on("connected", async () => {
                addLog("SDK Connected!");
                setStatus('connected');

                // Update session with painting context
                addLog('Sending session update with instructions and voice...');
                await session.update({
                    instructions: painting.systemInstructions,
                    voice: "alloy",
                    modalities: ["text", "audio"]
                });
                addLog('Session instructions and voice sent.');

                // Send Image (Vision)
                if (painting.imageUrl) {
                    addLog('Fetching and processing image for vision...');
                    try {
                        const imgRes = await fetch(painting.imageUrl);
                        const blob = await imgRes.blob();

                        let imageFormat = 'jpeg'; // Default format
                        if (blob.type === 'image/png') {
                            imageFormat = 'png';
                        } else if (blob.type === 'image/jpeg' || blob.type === 'image/jpg') {
                            imageFormat = 'jpeg';
                        }

                        const base64Image = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result.split(',')[1]); // remove data:image/... prefix
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                        addLog(`Image converted to Base64 (${imageFormat} format).`);

                        addLog('Sending initial message with image to model...');
                        await session.sendMessage({
                            role: "user",
                            type: "message",
                            content: [
                                {
                                    type: "input_text",
                                    text: "I'm looking at this painting. Please help me understand it."
                                },
                                {
                                    type: "input_image",
                                    image: {
                                        format: imageFormat,
                                        data: base64Image
                                    }
                                }
                            ]
                        });
                        addLog('Initial message with image sent!');
                    } catch (imgErr) {
                        addLog(`Failed to process or send image: ${imgErr.message}`);
                    }
                } else {
                    addLog('No image URL available for vision.');
                }
            });

            session.on("disconnected", () => {
                addLog("SDK Disconnected");
                setStatus('ready');
            });

            // C. Connect
            await session.connect({
                apiKey: EPHEMERAL_KEY,
            });

        } catch (err) {
            console.error(err);
            addLog(`ERROR: ${err.message}`);
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    const stopConversation = () => {
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
            setStatus('ready');
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
                            borderRadius: '50px',
                            cursor: 'pointer'
                        }}
                    >
                        End Call
                    </button>
                </div>
            )}

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