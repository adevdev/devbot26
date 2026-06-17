const wachan = require('wachan');

// Event: bot ready
wachan.onReady(() => {
    console.log('Bot WhatsApp siap!');
});

// Event: terima pesan
wachan.onReceive(async (sock, msg) => {
    const text = msg.message?.conversation || 
                 msg.message?.extendedTextMessage?.text || '';
    
    console.log(`Pesan dari ${msg.key.remoteJid}: ${text}`);
    
    // Auto reply
    if (text.toLowerCase() === 'ping') {
        await wachan.sendMessage(sock, msg.key.remoteJid, { text: 'pong!' });
    } else if (text.toLowerCase() === 'halo') {
        await wachan.sendMessage(sock, msg.key.remoteJid, { 
            text: 'Halo juga! Ada yang bisa saya bantu?' 
        });
    } else if (text.toLowerCase().startsWith('echo ')) {
        const echoText = text.substring(5);
        await wachan.sendMessage(sock, msg.key.remoteJid, { text: echoText });
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
