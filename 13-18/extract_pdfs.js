const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const dir = '.';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));

async function extract() {
    for (const file of files) {
        let dataBuffer = fs.readFileSync(path.join(dir, file));
        try {
            const pdfFunc = typeof pdf === 'function' ? pdf : (pdf.default || pdf.pdf);
            const data = await pdfFunc(dataBuffer);
            fs.writeFileSync(file + '.txt', data.text);
            console.log('Extracted ' + file);
        } catch (e) {
            console.error('Failed on ' + file, e.message);
        }
    }
}
extract();
