// ============================================
// utils/geolocate.js
// Look up an IP address using ipapi.co
// ============================================

const axios = require('axios');

async function geolocate(ip) {
    // If multiple IPs are in a comma-separated list (from X-Forwarded-For),
    // take the FIRST one — that's the original client.
    let cleanIp = (ip || '').split(',')[0].trim();

    // Strip IPv6-mapped IPv4 prefix
    if (cleanIp.startsWith('::ffff:')) {
        cleanIp = cleanIp.replace('::ffff:', '');
    }

    // Handle local/private IPs
    const isLocal =
        !cleanIp ||
        cleanIp === '::1' ||
        cleanIp === '127.0.0.1' ||
        cleanIp === 'localhost' ||
        cleanIp.startsWith('192.168.') ||
        cleanIp.startsWith('10.') ||
        cleanIp.startsWith('172.16.') ||
        cleanIp.startsWith('172.17.') ||
        cleanIp.startsWith('172.18.') ||
        cleanIp.startsWith('172.19.') ||
        cleanIp.startsWith('172.2') ||
        cleanIp.startsWith('172.30.') ||
        cleanIp.startsWith('172.31.');

    if (isLocal) {
        console.log('⚠️  Local/private IP detected, skipping lookup:', cleanIp);
        return {
            ip: cleanIp,
            city: 'Local Network',
            country: 'Local',
            lat: null,
            lon: null
        };
    }

    try {
        const response = await axios.get(`https://ipapi.co/${cleanIp}/json/`, {
            timeout: 5000,
            headers: { 'User-Agent': 'InstantID/1.0' }
        });

        const data = response.data;

        if (data.error) {
            console.log('⚠️  Geolocation error for IP', cleanIp, ':', data.reason);
            return {
                ip: cleanIp,
                city: 'Unknown',
                country: 'Unknown',
                lat: null,
                lon: null
            };
        }

        return {
            ip: cleanIp,
            city: data.city || 'Unknown',
            country: data.country_name || 'Unknown',
            lat: data.latitude || null,
            lon: data.longitude || null
        };
    } catch (err) {
        console.error('❌ Geolocation lookup failed for IP', cleanIp, ':', err.message);
        return {
            ip: cleanIp,
            city: 'Lookup Failed',
            country: 'Unknown',
            lat: null,
            lon: null
        };
    }
}

module.exports = geolocate;