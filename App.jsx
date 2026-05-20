import { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL;

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch(API_URL);
      const json = await res.json();
      setData(json);
      setLoading(false);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Real-Time Sentiment Dashboard</h1>
      <p>{data.length} records loaded</p>
      <pre style={{ fontSize: '0.75rem', background: '#f0f0f0', padding: '1rem' }}>
        {JSON.stringify(data[0], null, 2)}
      </pre>
    </div>
  );
}

export default App;