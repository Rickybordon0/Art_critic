import React, { useState, useEffect } from 'react';

export default function Admin() {
    const [activeTab, setActiveTab] = useState('create'); // 'create' | 'manage'
    const [paintings, setPaintings] = useState([]);

    // Form State
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        description: '',
        facts: ''
    });
    const [file, setFile] = useState(null);
    const [result, setResult] = useState(null); // Success screen data
    const [loading, setLoading] = useState(false);

    // Database View State
    const [showDatabase, setShowDatabase] = useState(false);

    useEffect(() => {
        if (activeTab === 'manage') {
            fetchPaintings();
        }
    }, [activeTab]);

    const fetchPaintings = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/paintings`);
            const data = await res.json();
            setPaintings(data);
        } catch (err) {
            console.error('Failed to fetch paintings', err);
        }
    };

    const handleEdit = (painting) => {
        setActiveTab('create');
        setEditingId(painting.id);
        setFormData({
            title: painting.title,
            slug: painting.slug || '',
            description: painting.description,
            facts: painting.facts
        });
        setResult(null);
        setFile(null); // Reset file input as we might not want to change it
    };

    const handleCreateNew = () => {
        setActiveTab('create');
        setEditingId(null);
        setFormData({ title: '', slug: '', description: '', facts: '' });
        setFile(null);
        setResult(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation
        if (!editingId && (!file || !formData.title)) return alert('Please provide image and title');
        if (editingId && !formData.title) return alert('Title is required');

        setLoading(true);
        const data = new FormData();
        if (file) data.append('image', file);
        data.append('title', formData.title);
        if (formData.slug) data.append('slug', formData.slug);
        data.append('description', formData.description);
        data.append('facts', formData.facts);

        try {
            const url = editingId
                ? `${import.meta.env.VITE_API_URL}/api/paintings/${editingId}`
                : `${import.meta.env.VITE_API_URL}/api/paintings`;

            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                body: data
            });

            if (!res.ok) throw new Error('Upload/Update failed');

            const json = await res.json();
            setResult(json);

            // If we were editing, refresh the list if we go back to manage
            if (activeTab === 'manage') fetchPaintings();

        } catch (err) {
            console.error(err);
            alert('Operation failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>Admin Dashboard</h1>
                <div>
                    <button
                        onClick={() => setShowDatabase(!showDatabase)}
                        style={{ marginRight: '10px', padding: '8px 12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        {showDatabase ? 'Hide Database' : 'View Database'}
                    </button>
                    <button
                        onClick={() => setActiveTab('create')}
                        style={{
                            padding: '8px 12px',
                            background: activeTab === 'create' ? '#007bff' : '#eee',
                            color: activeTab === 'create' ? 'white' : 'black',
                            border: 'none', borderRadius: '4px 0 0 4px', cursor: 'pointer'
                        }}
                    >
                        Create / Edit
                    </button>
                    <button
                        onClick={() => setActiveTab('manage')}
                        style={{
                            padding: '8px 12px',
                            background: activeTab === 'manage' ? '#007bff' : '#eee',
                            color: activeTab === 'manage' ? 'white' : 'black',
                            border: 'none', borderRadius: '0 4px 4px 0', cursor: 'pointer'
                        }}
                    >
                        Manage Agents
                    </button>
                </div>
            </div>

            {showDatabase && (
                <div style={{ marginBottom: '20px', background: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
                    <h3>Raw Database View</h3>
                    <textarea
                        readOnly
                        style={{ width: '100%', height: '300px', fontFamily: 'monospace', fontSize: '12px' }}
                        value={JSON.stringify(paintings, null, 2)}
                    />
                    <button onClick={fetchPaintings} style={{ marginTop: '10px', padding: '5px 10px' }}>Refresh Data</button>
                </div>
            )}

            {activeTab === 'manage' && (
                <div>
                    <h2>Existing Agents</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                        {paintings.map(p => (
                            <div key={p.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                                <img src={p.imageUrl} alt={p.title} style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px' }} />
                                <h3 style={{ margin: '10px 0', fontSize: '16px' }}>{p.title}</h3>
                                <p style={{ fontSize: '12px', color: '#666' }}>Slug: {p.slug || '-'}</p>
                                <button
                                    onClick={() => handleEdit(p)}
                                    style={{ padding: '5px 15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    Edit
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'create' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2>{editingId ? 'Edit Agent' : 'Create New Agent'}</h2>
                        {editingId && <button onClick={handleCreateNew} style={{ fontSize: '12px', cursor: 'pointer' }}>Cancel Edit</button>}
                    </div>

                    {!result ? (
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', background: '#f9f9f9', padding: '20px', borderRadius: '8px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px' }}>Painting Image {editingId && '(Leave empty to keep current)'}:</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={e => setFile(e.target.files[0])}
                                    required={!editingId}
                                />
                                {editingId && !file && <p style={{ fontSize: '12px', color: '#666' }}>Current image will be processed unless you upload a new one.</p>}
                            </div>

                            <input
                                placeholder="Title (e.g., Starry Night)"
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                required
                                style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                            />

                            <input
                                placeholder="Short Name/Slug (e.g., starry-night) - Optional"
                                value={formData.slug}
                                onChange={e => setFormData({ ...formData, slug: e.target.value })}
                                style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                            />

                            <textarea
                                placeholder="Description (Visual details used for AI system prompt)"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                rows={4}
                                style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                            />

                            <textarea
                                placeholder="Facts (History, Technique, etc. used for AI knowledge)"
                                value={formData.facts}
                                onChange={e => setFormData({ ...formData, facts: e.target.value })}
                                rows={4}
                                style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                            />

                            <button type="submit" disabled={loading} style={{ padding: '12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>
                                {loading ? 'Processing...' : (editingId ? 'Update Agent' : 'Create Agent')}
                            </button>
                        </form>
                    ) : (
                        <div style={{ textAlign: 'center', background: '#e0ffe0', padding: '30px', borderRadius: '8px' }}>
                            <h2>{editingId ? 'Update Successful!' : 'Creation Successful!'}</h2>
                            <p>Scan to chat with <b>{result.title}</b></p>
                            <img src={result.qrCodeDataUrl} alt="QR Code" style={{ width: '200px', height: '200px', border: '10px solid white' }} />
                            <p>
                                <a href={result.visitorUrl} target="_blank" rel="noreferrer" style={{ color: '#007bff', textDecoration: 'none', fontWeight: 'bold' }}>
                                    Open Visitor Link ↗
                                </a>
                            </p>
                            <div style={{ marginTop: '20px' }}>
                                <button
                                    onClick={() => { setResult(null); if (!editingId) handleCreateNew(); else setActiveTab('manage'); }}
                                    style={{ padding: '10px 20px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }}
                                >
                                    {editingId ? 'Back to List' : 'Upload Another'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
