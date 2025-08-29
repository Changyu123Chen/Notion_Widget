import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Clock from './widgets/Clock/Clock';
// import Weather from './widgets/Weather/Weather';
// import Quote from './widgets/Quote/Quote';

export default function App() {
  return (
    <Router>
      <nav style={{ padding: '1rem', background: '#f0f0f0' }}>
        <Link to="/clock">⏰ Clock</Link> |{" "}
        {/* <Link to="/weather">🌤 Weather</Link> |{" "}
        <Link to="/quote">💡 Quote</Link> */}
      </nav>
      <Routes>
        <Route path="/clock" element={<Clock />} />
        {/* <Route path="/weather" element={<Weather />} />
        <Route path="/quote" element={<Quote />} /> */}
      </Routes>
    </Router>
  );
}