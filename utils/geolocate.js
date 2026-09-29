// ============================================
// utils/geolocate.js
// Look up an IP address using ipapi.co
// ============================================

const axios = require('axios');

/**
 * Look up the location of an IP address.
 * @param {string} ip - The IP address to look up.
 * @returns {Object|null} - Location object or null if lookup fails.
 */
async function geolocate(ip) {
    // Handle local/private IPs — they can't be geolocated
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        console.log('⚠️  Local/private IP detected, skipping lookup:', ip);
        return {
            ip: ip || 'unknown',
            city: 'Local Network',
            country: 'Local',
            lat: null,
            lon: null
        };
    }

    try {
        const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
            timeout: 5000
        });

        const data = response.data;

        // ipapi.co returns an error field for reserved/invalid IPs
        if (data.error) {
            console.log('⚠️  Geolocation error for IP', ip, ':', data.reason);
            return null;
        }

        return {
            ip: data.ip,
            city: data.city || 'Unknown',
            country: data.country_name || 'Unknown',
            lat: data.latitude || null,
            lon: data.longitude || null
        };
    } catch (err) {
        console.error('❌ Geolocation lookup failed for IP', ip, ':', err.message);
        return null;
    }
}

module.exports = geolocate;