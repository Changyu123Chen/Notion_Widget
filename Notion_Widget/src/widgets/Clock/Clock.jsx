import { useEffect, useState } from 'react';

export default function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <h>Will design the view of clock later. This is just the initial setup!</h>
      <div style={{ fontSize: '3rem', textAlign: 'center', marginTop: '2rem' }}>
        {time.toLocaleTimeString()}
      </div>    
      
    </>

    
  );
}