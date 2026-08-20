import { useEffect, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function App() {
  const [health, setHealth] = useState<string>('loading...')

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setHealth(JSON.stringify(data)))
      .catch((err) => setHealth(`error: ${err.message}`))
  }, [])

  return (
    <>
      <h1>BizOps AI</h1>
      <p>Backend health check: {health}</p>
    </>
  )
}

export default App
