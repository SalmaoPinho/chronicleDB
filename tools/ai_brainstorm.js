/**
 * Ashford / Fairmount Local AI Timeline Brainstormer
 * 
 * This utility script automatically loads your character database (core.json) and
 * the entire compacted story timeline (compact_timeline.txt), detects your active 
 * local LLM server (LM Studio or Ollama), compiles a rich narrative context, and 
 * queries the model to brainstorm high-fidelity timeline entries.
 * 
 * Usage:
 *   node tools/ai_brainstorm.js "Write a scene where Clint meets Jess in 2026"
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');

// --- Configuration Paths ---
const ROOT_DIR = path.join(__dirname, '..');
const CORE_JSON_PATH = fs.existsSync(path.join(ROOT_DIR, 'stories', 'earthborn', 'core.json'))
  ? path.join(ROOT_DIR, 'stories', 'earthborn', 'core.json')
  : path.join(ROOT_DIR, 'story', 'core.json');
const COMPACT_TXT_PATH = path.join(ROOT_DIR, 'tools', 'compact_timeline.txt');
let NEW_TIMELINE_PATH = path.join(ROOT_DIR, 'stories', 'earthborn', 'newtimeline.md');
if (!fs.existsSync(NEW_TIMELINE_PATH)) {
  const altPath = path.join(ROOT_DIR, 'story', 'newtimeline.md');
  if (fs.existsSync(altPath)) {
    NEW_TIMELINE_PATH = altPath;
  }
}

// --- Server Ports to Probe ---
const SERVERS = [
  { name: 'LM Studio', port: 1234, path: '/v1/chat/completions' },
  { name: 'Ollama', port: 11434, path: '/v1/chat/completions' }
];

// --- Utility: Probe if a port is active ---
function probePort(port) {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port: port,
      path: '/',
      method: 'GET',
      timeout: 500
    }, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// --- Utility: Post JSON to local LLM ---
function postJson(server, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      host: '127.0.0.1',
      port: server.port,
      path: server.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response from ${server.name}: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

// --- Utility: Filter timeline context based on user query to stay under local context window limits ---
function filterTimelineContext(rawTimeline, userPrompt, coreData) {
  if (!rawTimeline) return '';

  const queryLower = userPrompt.toLowerCase();
  
  // 1. Detect character IDs mentioned in the query
  const detectedChars = [];
  Object.keys(coreData).forEach(id => {
    const lowerId = id.toLowerCase();
    const shortName = String(coreData[id]?.['short name'] || '').toLowerCase();
    const fullName = String(coreData[id]?.['full name'] || '').toLowerCase();
    
    if (queryLower.includes(lowerId) || 
        (shortName && queryLower.includes(shortName)) || 
        (fullName && queryLower.includes(fullName))) {
      detectedChars.push(lowerId);
      // Follow redirects to map aliases to canonical characters
      const canonicalId = coreData[id]?.redirect || id;
      detectedChars.push(canonicalId.toLowerCase());
    }
  });

  // 2. Detect years mentioned in the query
  const yearMatches = queryLower.match(/\b(19\d{2}|20\d{2})\b/g) || [];
  const detectedYears = yearMatches.map(y => parseInt(y, 10));

  // 3. Parse compact_timeline.txt lines
  const lines = rawTimeline.split('\n').filter(l => l.trim());
  const scoredEntries = [];

  lines.forEach(line => {
    // Format: YYYY-MM-DD[Title|tag1|tag2] Body
    const dateMatch = line.match(/^([^\s\[]+)/);
    if (!dateMatch) return;
    
    const dateStr = dateMatch[1];
    const yearMatch = dateStr.match(/^(-?\d+)/);
    const entryYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

    // Extract tags inside brackets
    const bracketMatch = line.match(/\[(.*?)\]/);
    const tagsStr = bracketMatch ? bracketMatch[1] : '';
    const tags = tagsStr.split('|').map(t => t.toLowerCase());

    const lowerLine = line.toLowerCase();
    let score = 0;

    // Check tag matches
    tags.forEach(t => {
      if (detectedChars.includes(t)) {
        score += 20; // High score for direct character matches
      }
    });

    // Check year proximity (highly relevant if same year or year within +- 2 years)
    if (entryYear && detectedYears.length > 0) {
      detectedYears.forEach(y => {
        const diff = Math.abs(entryYear - y);
        if (diff === 0) score += 30;
        else if (diff <= 2) score += 10;
      });
    }

    // Check text matches for query terms (excluding common words)
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
    queryWords.forEach(word => {
      if (lowerLine.includes(word)) {
        score += 5;
      }
    });

    if (score > 0) {
      scoredEntries.push({ line, score, year: entryYear });
    }
  });

  // Sort by score descending
  scoredEntries.sort((a, b) => b.score - a.score);

  // Apply strict character budget to guarantee it fits under local context limit (6,000 chars is ~1,200 tokens)
  let currentLength = 0;
  const topEntries = [];
  const MAX_CHAR_BUDGET = 6000;

  for (const e of scoredEntries) {
    if (topEntries.length > 0 && currentLength + e.line.length > MAX_CHAR_BUDGET) {
      break;
    }
    topEntries.push(e);
    currentLength += e.line.length;
  }

  // Re-sort the top entries chronologically for natural LLM ingestion
  topEntries.sort((a, b) => (a.line || '').localeCompare(b.line || ''));

  if (topEntries.length === 0) {
    console.log(`💡 No direct context matches found in the timeline. Providing baseline chronological context.`);
    let fallbackLength = 0;
    const fallbackEntries = [];
    const fallbackLines = lines.slice(-30);
    for (let i = fallbackLines.length - 1; i >= 0; i--) {
      const line = fallbackLines[i];
      if (fallbackEntries.length > 0 && fallbackLength + line.length > MAX_CHAR_BUDGET) {
        break;
      }
      fallbackEntries.push({ line });
      fallbackLength += line.length;
    }
    fallbackEntries.reverse();
    return fallbackEntries.map(e => e.line).join('\n');
  }

  console.log(`💡 Filtered timeline from ${lines.length} events down to ${topEntries.length} highly relevant events (~${Math.round(currentLength / 4)} tokens) to fit local context limits.`);
  
  return topEntries.map(e => e.line).join('\n');
}

// --- Utility: Check user prompt for logical timeline or character identity conflicts ---
function checkLoreConflicts(userPrompt, coreData) {
  const queryLower = userPrompt.toLowerCase();
  const warnings = [];
  const loreDirectives = [];

  // 1. Parse year in prompt
  const yearMatches = queryLower.match(/\b(19\d{2}|20\d{2})\b/g) || [];
  const detectedYears = yearMatches.map(y => parseInt(y, 10));
  const targetYear = detectedYears.length > 0 ? detectedYears[0] : null;

  // 2. Build active character name mapping
  const canonicalMap = {};
  Object.keys(coreData).forEach(id => {
    const char = coreData[id] || {};
    const canonicalId = char.redirect || id;
    
    canonicalMap[id.toLowerCase()] = canonicalId;
    const shortName = String(char['short name'] || '').toLowerCase();
    if (shortName) canonicalMap[shortName] = canonicalId;
    const fullName = String(char['full name'] || '').toLowerCase();
    if (fullName) canonicalMap[fullName] = canonicalId;
  });

  // 3. Detect active character canonical IDs
  const activeIds = new Set();
  Object.keys(canonicalMap).forEach(name => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(queryLower)) {
        activeIds.add(canonicalMap[name]);
      }
    } catch (e) {
      if (queryLower.includes(trimmed)) {
        activeIds.add(canonicalMap[name]);
      }
    }
  });

  // 4. Dynamic alias link checker (e.g. Clint is Midnight)
  Object.keys(coreData).forEach(aliasId => {
    const char = coreData[aliasId] || {};
    if (char.redirect) {
      const canonicalTarget = char.redirect;
      const trimmedAlias = aliasId.trim();
      if (!trimmedAlias) return;
      
      try {
        const escapedAlias = trimmedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const aliasRegex = new RegExp(`\\b${escapedAlias}\\b`, 'i');
        
        if (aliasRegex.test(queryLower)) {
          // Look for other canonical characters in the query
          Object.keys(coreData).forEach(otherId => {
            if (otherId === canonicalTarget || otherId === aliasId) return;
            const otherChar = coreData[otherId] || {};
            if (otherChar.redirect) return; // skip other aliases
            
            const shortName = String(otherChar['short name'] || '').toLowerCase();
            const fullName = String(otherChar['full name'] || '').toLowerCase();
            
            const namesToCheck = [otherId];
            if (shortName) namesToCheck.push(shortName);
            if (fullName) namesToCheck.push(fullName);
            
            namesToCheck.forEach(name => {
              const trimmedName = name.trim();
              if (!trimmedName) return;
              
              const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'i');
              if (nameRegex.test(queryLower)) {
                // We have both the alias (e.g. "midnight" -> "arthur") and another character (e.g. "clint")
                const linkagePatterns = [
                  new RegExp(`\\b${escapedName}\\b\\s+(?:is|was|being|as|identity\\s+of)\\s+\\b${escapedAlias}\\b`, 'i'),
                  new RegExp(`\\b${escapedAlias}\\b\\s+(?:is|was|being|as|identity\\s+of)\\s+\\b${escapedName}\\b`, 'i'),
                  new RegExp(`realizes?\\s+\\b${escapedName}\\b\\s+is\\s+\\b${escapedAlias}\\b`, 'i'),
                  new RegExp(`reveals?\\s+\\b${escapedName}\\b\\s+is\\s+\\b${escapedAlias}\\b`, 'i')
                ];
                
                if (linkagePatterns.some(p => p.test(queryLower))) {
                  const aliasNameUpper = aliasId.charAt(0).toUpperCase() + aliasId.slice(1);
                  const canonicalName = coreData[canonicalTarget]?.['full name'] || canonicalTarget;
                  const otherName = otherChar['full name'] || otherId;
                  
                  let otherAliasStr = '';
                  Object.keys(coreData).forEach(k => {
                    if (coreData[k]?.redirect === otherId) {
                      otherAliasStr = ` (alias: **${k}**)`;
                    }
                  });
                  
                  warnings.push(`⚠️  Lore Mismatch: You linked **${otherName}** with **${aliasNameUpper}**. In this universe, **${aliasNameUpper}** is the alias of **${canonicalName}** (\`${canonicalTarget}\`), whereas **${otherName}** is a separate character${otherAliasStr}.`);
                  loreDirectives.push(`- LORE CORRECTION: The user's query implies ${otherName} is ${aliasNameUpper}. This is a lore error. ${aliasNameUpper} is ${canonicalName} (${canonicalTarget}). ${otherName} is a separate character. Ensure the output respects this: if another character thinks ${otherName} is ${aliasNameUpper}, they should be corrected or realize their mistake, or the narrative should clarify the truth.`);
                }
              }
            });
          });
        }
      } catch (e) {
        // Fallback simple checks
      }
    }
  });

  // 5. Check for death date vs active scene year conflicts
  Array.from(activeIds).forEach(id => {
    const char = coreData[id] || {};
    if (char.deathDate && targetYear) {
      const deathYear = parseInt(char.deathDate.split('-')[0], 10);
      if (targetYear > deathYear) {
        const charName = char['full name'] || id;
        warnings.push(`⚠️  Timeline Conflict: You set the scene in **${targetYear}** with **${charName}** (\`${id}\`). However, they died on **${char.deathDate}**.`);
        loreDirectives.push(`- CHRONOLOGY DIRECTION: The user requested a scene in ${targetYear} involving ${charName} (${id}), but this character is deceased by this year (died on ${char.deathDate}). Ensure the scene operates within this constraint (e.g., they are remembered, it's a flashback, or the characters are dealing with the aftermath of their death).`);
      }
    }
  });

  return { warnings, loreDirectives };
}

// --- Main Execution Flow ---
async function main() {
  const args = process.argv.slice(2);
  const userPrompt = args.join(' ').trim();

  if (!userPrompt) {
    console.log('\x1b[36m%s\x1b[0m', '=== ASHFORD / FAIRMOUNT LOCAL AI BRAINSTORMER ===');
    console.log('Usage:');
    console.log('  node tools/ai_brainstorm.js "<your brainstorming query>"\n');
    console.log('Example:');
    console.log('  node tools/ai_brainstorm.js "Write a scene in 2026 where Amber realizes Clint is Midnight"\n');
    process.exit(0);
  }

  console.log('\x1b[33m%s\x1b[0m', '🔍 Loading narrative context from files...');

  // 1. Load core.json
  let coreData = {};
  if (fs.existsSync(CORE_JSON_PATH)) {
    try {
      const coreJson = JSON.parse(fs.readFileSync(CORE_JSON_PATH, 'utf8'));
      coreData = coreJson.characters || {};
      console.log(`✅ Loaded ${Object.keys(coreData).length} character dossiers from core.json.`);
    } catch (e) {
      console.warn('⚠️  Could not parse core.json. Falling back without character details.');
    }
  } else {
    console.warn(`⚠️  core.json not found at ${CORE_JSON_PATH}.`);
  }

  // 1b. Check prompt for narrative / lore conflicts
  const { warnings, loreDirectives } = checkLoreConflicts(userPrompt, coreData);
  if (warnings.length > 0) {
    console.log('\n\x1b[41m\x1b[37m%s\x1b[0m', ' 🔍 NARRATIVE INTEGRITY WARNING ');
    warnings.forEach(w => console.log(`\x1b[31m%s\x1b[0m`, `  • ${w}`));
    console.log('');
  }

  // 2. Load compact_timeline.txt
  let timelineContext = '';
  if (fs.existsSync(COMPACT_TXT_PATH)) {
    const rawTimeline = fs.readFileSync(COMPACT_TXT_PATH, 'utf8');
    console.log(`✅ Loaded compacted story timeline context (${Math.round(rawTimeline.length / 1024)} KB).`);
    timelineContext = filterTimelineContext(rawTimeline, userPrompt, coreData);
  } else {
    console.log('⚠️  compact_timeline.txt not found. We recommend running ".\\compact_timeline.bat" first to compile context.');
  }

  // 3. Detect active LLM server
  let activeServer = null;
  console.log('\x1b[33m%s\x1b[0m', '📡 Probing local LLM ports...');
  for (const s of SERVERS) {
    const active = await probePort(s.port);
    if (active) {
      activeServer = s;
      console.log(`✅ Found active local server: ${s.name} on port ${s.port}.`);
      break;
    }
  }

  if (!activeServer) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Error: No local LLM servers found!');
    console.error('Please ensure either LM Studio is running (port 1234) or Ollama is running (port 11434) with a model loaded.');
    process.exit(1);
  }

  // 4. Assemble the System Prompt
  const worldVibe = "The story balances mundane, suburban high school politics in Ashford with a gritty, street-level vigilante underbelly in the neighboring city of Fairmount. Ashford is quiet and seemingly safe, characterized by petty social hierarchies, intense interpersonal observations, and hidden emotional currents. Fairmount is larger, politically volatile, and dangerous, home to corrupt institutions, violent crimes, and vigilantes like 'Midnight'. The overarching tone is grounded, psychological, and neo-noir. Actions have heavy, realistic consequences, trauma is carried silently, and characters operate on secrets, blackmail, and unsaid truths. The narrative focuses on raw human drama, hidden lives, and complex moral gray areas rather than over-the-top action.";

  // 4. Filter character dossiers dynamically to save context window space
  const activeChars = new Set();
  const queryLower = userPrompt.toLowerCase();

  // Detect direct matches in query
  Object.keys(coreData).forEach(id => {
    const lowerId = id.toLowerCase();
    const shortName = String(coreData[id]?.['short name'] || '').toLowerCase();
    const fullName = String(coreData[id]?.['full name'] || '').toLowerCase();
    
    if (queryLower.includes(lowerId) || 
        (shortName && queryLower.includes(shortName)) || 
        (fullName && queryLower.includes(fullName))) {
      activeChars.add(id);
      const canonicalId = coreData[id]?.redirect || id;
      activeChars.add(canonicalId);
    }
  });

  // Detect matches from filtered timeline context
  const timelineLines = timelineContext.split('\n');
  timelineLines.forEach(line => {
    const bracketMatch = line.match(/\[(.*?)\]/);
    if (bracketMatch) {
      const tags = bracketMatch[1].split('|').map(t => t.trim().toLowerCase());
      tags.forEach(tag => {
        if (coreData[tag]) {
          activeChars.add(tag);
          const canonicalId = coreData[tag]?.redirect || tag;
          activeChars.add(canonicalId);
        }
      });
    }
  });

  // Assemble dossiers (up to 8 to avoid context window bloat)
  let characterSummaries = '';
  const finalActiveChars = Array.from(activeChars).slice(0, 8);
  
  if (finalActiveChars.length > 0) {
    characterSummaries = finalActiveChars.map(id => {
      const data = coreData[id] || {};
      return `- ID: ${id} | Full Name: ${data['full name'] || id} | Short Name: ${data['short name'] || id} | Gender: ${data.gender || 'Unknown'}\n  Traits: Hair: ${data.hair || 'N/A'}, Eyes: ${data.eyes || 'N/A'}, Ethnicity: ${data.ethnicity || 'N/A'}`;
    }).join('\n');
    console.log(`💡 Loaded ${finalActiveChars.length} relevant character dossiers in prompt context.`);
  } else {
    // Default fallback
    const defaults = ['clint', 'jess', 'amber'];
    characterSummaries = defaults.filter(id => coreData[id]).map(id => {
      const data = coreData[id];
      return `- ID: ${id} | Full Name: ${data['full name'] || id} | Short Name: ${data['short name'] || id} | Gender: ${data.gender || 'Unknown'}\n  Traits: Hair: ${data.hair || 'N/A'}, Eyes: ${data.eyes || 'N/A'}, Ethnicity: ${data.ethnicity || 'N/A'}`;
    }).join('\n');
    console.log(`💡 Loaded default character dossiers (Clint, Jess, Amber) in prompt context.`);
  }

  const systemInstructionsConcept = `You are a professional co-writer and narrative continuity assistant for a premium grounded, neo-noir visual novel / story.
Your task is to brainstorm exactly THREE distinct, compelling concepts/angles for a timeline entry based on the user's prompt. Do NOT write the final full scene yet.

### WORLD VIBE & SETTING TONE:
${worldVibe}

### CHARACTER REGISTRY & TRAITS:
${characterSummaries}

### COMPACTED TIMELINE NARRATIVE CONTEXT (Past events up to this moment):
${timelineContext}

---

### INSTRUCTIONS FOR BRAINSTORMING OPTIONS:
Provide exactly three distinct concepts. For each concept, provide:
1. **Concept Name & Logline**
2. **The Core Event/Action** (what physically happens, keeping it grounded and action-oriented)
3. **The Emotional Stakes & Lore Connections** (why it matters, how it ties to existing history)
4. **Draft Timeline YAML frontmatter outline** (target Date YYYY-MM-DD, proposed Title, and Tags)

Format each option clearly using markdown headers (e.g. ## Concept 1: [Name]) so the user can easily read and select.
${loreDirectives.length > 0 ? `\n\n### CRITICAL NARRATIVE DIRECTIVES:\n${loreDirectives.join('\n')}\n` : ''}`;

  const systemInstructionsDraft = (brainstormOptions) => `You are a professional co-writer and narrative continuity assistant for a premium grounded, neo-noir visual novel / story.
Your task is to draft the final, full-length story timeline entry in the exact canonical format based on the chosen concept and user adjustments.

### WORLD VIBE & SETTING TONE:
${worldVibe}

### CHARACTER REGISTRY & TRAITS:
${characterSummaries}

### ORIGINAL BRAINSTORM CONCEPTS:
${brainstormOptions}

---

### INSTRUCTIONS FOR THE TIMELINE ENTRY FORMAT:
You MUST output the finalized entry in the exact permanent record format shown below. Do NOT add conversational preambles or chat notes outside of the YAML block.

\`\`\`yaml
---
date: "YYYY-MM-DD"
title: "Entry Title"
tags:
  - "character-tag"
  - "theme-tag"
---

Entry body text. Use grounded, psychological, and literary neo-noir prose. Show rather than tell. Emphasize unsaid thoughts, physical cues, and realistic drama. Keep paragraphs clean and immersive.
\`\`\`

Ensure you strictly respect the timeline continuity—characters cannot know the future beyond the date of the entry they are participating in. Output the finalized entry block at the very end of your response.
${loreDirectives.length > 0 ? `\n\n### CRITICAL NARRATIVE DIRECTIVES:\n${loreDirectives.join('\n')}\n` : ''}`;

  // 5. Query the LLM for Narrative Options (Step 1)
  console.log('\x1b[35m%s\x1b[0m', `🚀 Querying your local model via ${activeServer.name} for 3 narrative concepts...`);
  
  const payload1 = {
    model: 'auto',
    messages: [
      { role: 'system', content: systemInstructionsConcept },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7
  };

  try {
    const start1 = Date.now();
    const result1 = await postJson(activeServer, payload1);
    const duration1 = ((Date.now() - start1) / 1000).toFixed(1);

    const brainstormOptions = result1.choices?.[0]?.message?.content || '';
    if (!brainstormOptions) {
      console.error('⚠️ Received empty response from local model.');
      process.exit(1);
    }

    console.log('\n\x1b[32m%s\x1b[0m', `=== STEP 1: NARRATIVE CONCEPTS FROM LOCAL MODEL (${duration1}s) ===\n`);
    console.log(brainstormOptions);
    console.log('\n==================================================================\n');

    // 6. Interactive prompt for user selection (Step 2)
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('\x1b[36m👉 Select a concept (1, 2, or 3) or type custom refinements: \x1b[0m', async (selection) => {
      const trimmedSelection = selection.trim();
      if (!trimmedSelection) {
        console.log('Cancelled.');
        rl.close();
        process.exit(0);
      }

      console.log('\n\x1b[33m%s\x1b[0m', `🚀 Drafting final high-fidelity timeline entry for your selection...`);
      
      const payload2 = {
        model: 'auto',
        messages: [
          { role: 'system', content: systemInstructionsDraft(brainstormOptions) },
          { role: 'user', content: `Draft the chosen option: "${trimmedSelection}"` }
        ],
        temperature: 0.7
      };

      try {
        const start2 = Date.now();
        const result2 = await postJson(activeServer, payload2);
        const duration2 = ((Date.now() - start2) / 1000).toFixed(1);

        const finalDraft = result2.choices?.[0]?.message?.content || '';
        console.log('\n\x1b[32m%s\x1b[0m', `=== STEP 2: CANONICAL DRAFT FROM LOCAL MODEL (${duration2}s) ===\n`);
        console.log(finalDraft);
        console.log('\n==================================================================\n');

        // Extract candidate timeline entry block for quick appending
        const entryMatch = finalDraft.match(/```yaml([\s\S]*?)```/i) || finalDraft.match(/---[\s\S]*?---[\s\S]+/);
        if (entryMatch) {
          let entryContent = entryMatch[0];
          if (entryContent.startsWith('```yaml')) {
            entryContent = entryContent.replace(/^```yaml\n/, '').replace(/\n```$/, '');
          }

          console.log('\x1b[36m%s\x1b[0m', '💡 Detected a candidate timeline entry in the response!');
          
          rl.question('Would you like to automatically append this entry to stories/earthborn/newtimeline.md? (y/N) ', (answer) => {
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
              try {
                const appendStr = `\n<!-- entry-break -->\n\n${entryContent.trim()}\n`;
                fs.appendFileSync(NEW_TIMELINE_PATH, appendStr, 'utf8');
                console.log(`\n✅ Successfully appended the entry to ${NEW_TIMELINE_PATH}!`);
                console.log('💡 Run ".\\timeline_pipeline.bat" to inject and sort it.');
              } catch (e) {
                console.error('❌ Failed to write to newtimeline.md:', e.message);
              }
            } else {
              console.log('skipped appending.');
            }
            rl.close();
          });
        } else {
          console.log('⚠️ Could not extract standard YAML block from draft.');
          rl.close();
        }

      } catch (err) {
        console.error('\x1b[31m%s\x1b[0m', `❌ Failed during drafting step: ${err.message}`);
        rl.close();
      }
    });

  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', `❌ Failed to query local LLM: ${err.message}`);
  }
}

main();
