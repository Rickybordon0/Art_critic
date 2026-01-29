import React, { useState } from 'react';

export default function Admin() {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        facts: ''
    });
    const [file, setFile] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file || !formData.title) return alert('Please provide image and title');

        setLoading(true);
        const data = new FormData();
        data.append('image', file);
        data.append('title', formData.title);
        if (formData.slug) data.append('slug', formData.slug);
        data.append('description', formData.description);
        data.append('facts', formData.facts);

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/paintings`, {
                method: 'POST',
                body: data
            });
            const json = await res.json();
            setResult(json);
        } catch (err) {
            console.error(err);
            alert('Upload failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
            <h1>Curator Interface</h1>

            {!result ? (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label>Painting Image:</label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={e => setFile(e.target.files[0])}
                            required
                        />
                    </div>

                    <input
                        placeholder="Title (e.g., Starry Night)"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        required
                        style={{ padding: '8px' }}
                    />

                    <input
                        placeholder="Short Name/Slug (e.g., starry-night) - Optional"
                        value={formData.slug || ''}
                        onChange={e => setFormData({ ...formData, slug: e.target.value })}
                        style={{ padding: '8px' }}
                    />

                    <textarea
                        placeholder="Description (Visual details)"
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        rows={4}
                        style={{ padding: '8px' }}
                    />

                    <textarea
                        placeholder="Facts (History, Technique, etc.)"
                        value={formData.facts}
                        onChange={e => setFormData({ ...formData, facts: e.target.value })}
                        rows={4}
                        style={{ padding: '8px' }}
                    />

                    <button type="submit" disabled={loading} style={{ padding: '10px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>
                        {loading ? 'Creating Profile...' : 'Create Art Expert'}
                    </button>
                </form>
            ) : (
                <div style={{ textAlign: 'center' }}>
                    <h2>Success!</h2>
                    <p>Scan to chat with <b>{result.title}</b></p>
                    <img src={result.qrCodeDataUrl} alt="QR Code" style={{ width: '200px', height: '200px' }} />
                    <p>
                        <a href={result.visitorUrl} target="_blank" rel="noreferrer">Open Visitor Link</a>
                    </p>
                    <button onClick={() => { setResult(null); setFile(null); setFormData({ title: '', slug: '', description: '', facts: '' }); }}>
                        Upload Another
                    </button>
                </div>
            )}
        </div>
    );
}
