const fs = require('fs');

const filePath = 'mr.html';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let newLines = [];
let fixedTimeline = false;
let fixedWrapper = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 1. Check for the broken timeline pattern
    // Pattern: Caption -> Close Slot -> Close List -> EXTRA CLOSE -> Date Shell
    if (!fixedTimeline && i < lines.length - 4 && 
        line.includes('class="mr-timeline-media-caption"') &&
        lines[i+1].includes('</div>') &&
        lines[i+2].includes('</div>') &&
        lines[i+3].trim() === '</div>' &&
        lines[i+4].includes('class="mr-timeline-date-shell"')) {
        
        console.log('Found broken timeline pattern at line ' + (i+1));
        newLines.push(line);
        newLines.push(lines[i+1]);
        newLines.push(lines[i+2]);
        // Skip lines[i+3] - the extra div
        i += 3; 
        fixedTimeline = true;
        continue;
    }

    // 2. Add the missing closing div for the reactivity wrapper
    // We add it just before the </article> at approx line 1127 (the one that closes the active card)
    if (!fixedWrapper && i > 1100 && line.trim() === '</article>' && lines[i+1] && lines[i+2] && lines[i+2].includes('v-else class="mr-card"')) {
        console.log('Adding missing closing div for reactivity wrapper at line ' + (i+1));
        newLines.push('        </div>');
        newLines.push(line);
        fixedWrapper = true;
        continue;
    }

    newLines.push(line);
}

fs.writeFileSync(filePath, newLines.join('\n'));
console.log('Final HTML repair complete.');
