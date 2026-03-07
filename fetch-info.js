fetch('http://localhost:3000/api/console/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: '/info itsb2_ su' })
}).then(res => res.json()).then(data => console.log('INFO SU:', JSON.stringify(data.output, null, 2)))
    .catch(console.error);

fetch('http://localhost:3000/api/console/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: '/baninfo itsb2_' })
}).then(res => res.json()).then(data => console.log('BANINFO:', JSON.stringify(data.output, null, 2)))
    .catch(console.error);
