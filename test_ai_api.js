
async function test() {
  try {
    const resp = await fetch('http://localhost:3000/api/ai/analyze-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'flood in the street' })
    });
    const json = await resp.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error(err);
  }
}
test();
