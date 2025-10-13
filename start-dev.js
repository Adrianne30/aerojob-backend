const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting AeroJob Development Environment...\n');

// Function to start a server
function startServer(scriptPath, port, name) {
  console.log(`📡 Starting ${name} on port ${port}...`);
  
  const server = spawn('node', [scriptPath], {
    stdio: 'inherit',
    cwd: __dirname
  });

  server.on('error', (error) => {
    console.error(`❌ Error starting ${name}:`, error.message);
  });

  server.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ ${name} exited with code ${code}`);
    }
  });

  return server;
}

// Start both servers
const mockServer = startServer('mockServer.js', 5001, 'Mock Server');
const mainServer = startServer('server_clean.js', 5000, 'Main Server');

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down servers...');
  mockServer.kill('SIGINT');
  mainServer.kill('SIGINT');
  process.exit(0);
});

console.log('\n✅ Development servers started!');
console.log('📊 Mock Server: http://localhost:5001');
console.log('🎯 Main Server: http://localhost:5000');
console.log('\nPress Ctrl+C to stop all servers\n');
