const wachan = require('wachan');

// Event: bot ready
wachan.onReady(() => {
    console.log('Bot WhatsApp siap!');
});

// Event: terima pesan - gunakan filter function untuk skip offline
wachan.onReceive((msg) => {
    // Filter: hanya proses pesan online dengan text
    if (!msg.receivedOnline) return false;
    if (!msg.text) return false;
    return true;
}, async (context) => {
    const { message: msg } = context;
    const text = msg.text;
    
    console.log(`Pesan dari ${msg.sender.name || msg.sender.id}: ${text}`);
    
    // Auto reply
    if (text.toLowerCase() === 'ping') {
        return 'pong!';
    } else if (text.toLowerCase() === 'halo') {
        return 'Halo juga! Ada yang bisa saya bantu?';
    } else if (text.toLowerCase().startsWith('echo ')) {
        const echoText = text.substring(5);
        return echoText;
    }
});

// Event: connected
wachan.onConnected(() => {
    console.log('Authenticated!');
});

// Event: error
wachan.onError((error) => {
    console.error('Error:', error);
});

// Start bot
wachan.start();
