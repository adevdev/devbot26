const os = require('os');

module.exports = {
    response: async (context, next) => {
        // System info
        const platform = os.platform();
        const type = os.type();
        const release = os.release();
        const arch = os.arch();

        // CPU info
        const cpus = os.cpus();
        const cpuModel = cpus[0]?.model || 'Unknown';
        const cpuCores = cpus.length;
        const cpuSpeed = cpus[0]?.speed ? `${cpus[0].speed} MHz` : 'Unknown';

        // Memory info
        const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(2);
        const freeMem = (os.freemem() / (1024 ** 3)).toFixed(2);
        const usedMem = (totalMem - freeMem).toFixed(2);
        const memUsage = ((usedMem / totalMem) * 100).toFixed(1);

        // Process memory
        const processMem = process.memoryUsage();
        const heapUsed = (processMem.heapUsed / (1024 ** 2)).toFixed(2);
        const heapTotal = (processMem.heapTotal / (1024 ** 2)).toFixed(2);

        // Uptime
        const sysUptime = formatUptime(os.uptime());
        const processUptime = formatUptime(process.uptime());

        // Node info
        const nodeVersion = process.version;

        // Hostname
        const hostname = os.hostname();

        const info = `*System Information*\n\n` +
                    `*OS:* ${type} ${release}\n` +
                    `*Platform:* ${platform}\n` +
                    `*Architecture:* ${arch}\n` +
                    `*Hostname:* ${hostname}\n\n` +
                    `*CPU:* ${cpuModel}\n` +
                    `*Cores:* ${cpuCores}\n` +
                    `*Speed:* ${cpuSpeed}\n\n` +
                    `*Total Memory:* ${totalMem} GB\n` +
                    `*Used Memory:* ${usedMem} GB (${memUsage}%)\n` +
                    `*Free Memory:* ${freeMem} GB\n\n` +
                    `*Process Memory:* ${heapUsed} MB / ${heapTotal} MB\n\n` +
                    `*System Uptime:* ${sysUptime}\n` +
                    `*Process Uptime:* ${processUptime}\n\n` +
                    `*Node.js:* ${nodeVersion}`;

        return info;
    },
    options: {
        aliases: ['sys'],
        description: 'Display system information and specs',
        sectionName: 'Tools'
    }
};

// Format uptime to human readable
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}
