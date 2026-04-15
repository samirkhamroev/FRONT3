const fs = require('fs');
const https = require('https');

if (!fs.existsSync('icons')) {
    fs.mkdirSync('icons');
}

const sizes = [16, 32, 48, 64, 128, 256, 512];

let index = 0;
function downloadNext() {
    if (index >= sizes.length) {
        https.get('https://placehold.co/16x16.png', response => {
            const file = fs.createWriteStream('icons/favicon.ico');
            response.pipe(file);
            console.log('Downloaded favicon.ico');
        });
        return;
    }
    const size = sizes[index++];
    const file = fs.createWriteStream(`icons/favicon-${size}x${size}.png`);
    let color = 'FF8C00';
    https.get(`https://placehold.co/${size}x${size}/${color}/ffffff.png?text=Note`, response => {
        response.pipe(file);
        file.on('finish', () => {
             console.log(`Downloaded ${size}x${size}`);
             downloadNext();
        });
    });
}
downloadNext();
