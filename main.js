import { Actor } from 'apify';
import OpenAI from 'openai';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import fetch from 'node-fetch';

await Actor.init();

const input = await Actor.getInput();

/**
INPUT attendu :
{
  "profiles": [
    {
      "url": "https://...",
      "text": "bio ou contenu copié (optionnel)"
    }
  ]
}
*/

const profiles = input.profiles || [];

// 🔑 OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// 📊 Google Sheets
const doc = new GoogleSpreadsheet(process.env.GSHEET_ID);

await doc.useServiceAccountAuth({
    client_email: process.env.GSHEET_CLIENT_EMAIL,
    private_key: process.env.GSHEET_PRIVATE_KEY.replace(/\\n/g, '\n'),
});

await doc.loadInfo();
const sheet = doc.sheetsByIndex[0];

// 🧠 Fonction extraction IA
async function extractData(text) {
    const prompt = `
Analyse ce profil de coach professionnel et retourne un JSON :

{
  "nom": "",
  "prenom": "",
  "type_coaching": "",
  "difficultes": "",
  "outils": "",
  "temps_preparation": "",
  "besoins": ""
}

Texte :
${text}
`;

    const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
    });

    try {
        return JSON.parse(response.choices[0].message.content);
    } catch (e) {
        return {};
    }
}

// 🌐 récupération HTML simple (pages publiques uniquement)
async function fetchPage(url) {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
            },
        });
        return await res.text();
    } catch {
        return "";
    }
}

// 🔄 boucle principale
for (const profile of profiles) {
    let text = profile.text || "";

    if (!text && profile.url) {
        const html = await fetchPage(profile.url);
        text = html.replace(/<[^>]*>?/gm, '').slice(0, 5000);
    }

    const data = await extractData(text);

    const row = {
        url: profile.url || "",
        ...data,
    };

    // Sauvegarde Apify
    await Actor.pushData(row);

    // Envoi Google Sheets
    await sheet.addRow(row);
}

await Actor.exit();
