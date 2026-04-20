
export const BACKEND_URL = "";
export const TRACK_LABEL_OFFSET = 38;

export const REASSURING_MESSAGES = [
  "Initializing neural engines...",
  "Sculpting pixels from thin air...",
  "Applying temporal consistency algorithms...",
  "Optimizing light transport and shadows...",
  "Almost there! Just a final polish...",
  "Generating cinematic frames...",
  "Harmonizing visual flow...",
  "Finalizing rendering sequence..."
];

// --- SPEED CURVE PRESETS ---
export const SPEED_PRESETS = {
    'Montage': { points: [{time:0, speed:1}, {time:0.2, speed:2}, {time:0.5, speed:0.5}, {time:0.8, speed:2}, {time:1, speed:1}] },
    'Hero': { points: [{time:0, speed:1}, {time:0.4, speed:0.2}, {time:0.6, speed:0.2}, {time:1, speed:1}] }, // Slow motion in middle
    'Bullet': { points: [{time:0, speed:5}, {time:0.1, speed:0.1}, {time:0.9, speed:0.1}, {time:1, speed:5}] }, // Fast start/end, super slow middle
    'Jump Cut': { points: [{time:0, speed:1}, {time:0.5, speed:100}, {time:0.51, speed:1}, {time:1, speed:1}] }, // Instant jump
    'Flash In': { points: [{time:0, speed:5}, {time:0.3, speed:1}, {time:1, speed:1}] },
    'Flash Out': { points: [{time:0, speed:1}, {time:0.7, speed:1}, {time:1, speed:5}] },
};

// --- MASSIVE VOICE GENERATOR (900+ Tonal Voices - Neutral Base) ---
const generateVoiceVariations = () => {
    // Base Gemini Models
    // Feminine: Kore (Balanced), Zephyr (Soft/Airy)
    // Masculine: Puck (Mid/Energetic), Charon (Deep/Calm), Fenrir (Deep/Rough)
    const bases = {
        'F1': 'Kore',
        'F2': 'Zephyr',
        'M1': 'Puck',
        'M2': 'Charon',
        'M3': 'Fenrir'
    };

    const languages = [
        { id: 'pt-br', name: '🇧🇷 Português (BR)', prompt: 'Portuguese (Brazil)' },
        { id: 'en-us', name: '🇺🇸 Inglês (EUA)', prompt: 'English (US)' },
        { id: 'en-uk', name: '🇬🇧 Inglês (UK)', prompt: 'English (UK)' },
        { id: 'de-de', name: '🇩🇪 Alemão', prompt: 'German' },
        { id: 'es-es', name: '🇪🇸 Espanhol', prompt: 'Spanish' },
        { id: 'fr-fr', name: '🇫🇷 Francês', prompt: 'French' },
        { id: 'it-it', name: '🇮🇹 Italiano', prompt: 'Italian' },
        { id: 'ru-ru', name: '🇷🇺 Russo', prompt: 'Russian' },
        { id: 'jp-jp', name: '🇯🇵 Japonês', prompt: 'Japanese' }
    ];

    // --- TONALIDADES MASCULINAS (55 Variações Físicas) ---
    const masculineTones = [
        // Realista / Padrão
        { id: 'm-std', name: 'João - Padrão (Neutro)', base: 'M1', prompt: 'neutral tone, standard male pitch, clear articulation' },
        { id: 'm-casual', name: 'Ricardo - Casual / Conversa', base: 'M1', prompt: 'neutral tone, relaxed articulation, conversational pace' },
        { id: 'm-corp', name: 'Alberto - Corporativo / CEO', base: 'M1', prompt: 'neutral tone, confident projection, sharp diction, business style' },
        { id: 'm-soft', name: 'Tiago - Suave / Tímido', base: 'M1', prompt: 'neutral tone, low volume, soft projection, gentle timbre' },
        
        // Graves e Profundos
        { id: 'm-deep-1', name: 'Marcos - Grave (Bass)', base: 'M2', prompt: 'neutral tone, deep pitch, chest resonance' },
        { id: 'm-deep-2', name: 'Gustavo - Ultra Grave (Sub)', base: 'M3', prompt: 'neutral tone, very low sub-bass pitch, rumble resonance' },
        { id: 'm-trailer', name: 'Narrador - Voz de Trailer', base: 'M3', prompt: 'neutral tone, epic projection, deep bass, highly compressed' },
        { id: 'm-smooth', name: 'Paulo - Grave Aveludado', base: 'M2', prompt: 'neutral tone, deep pitch, smooth texture, soft resonance' },
        { id: 'm-giant', name: 'Gorg - Gigante / Ogro', base: 'M3', prompt: 'neutral tone, thick vocal folds, muffled texture, heavy projection, giant-like' },
        { id: 'm-kratos', name: 'Kratos - Guerreiro', base: 'M3', prompt: 'neutral tone, deep gravelly voice, stoic, heavy breathing' },

        // Texturas (Rouco, Lixa, etc)
        { id: 'm-raspy', name: 'Cadu - Rouco Médio', base: 'M3', prompt: 'neutral tone, smoky texture, dry throat sound' },
        { id: 'm-gravel', name: 'Beto - Rouco Pesado (Gravel)', base: 'M3', prompt: 'neutral tone, deep pitch, gravelly texture, scratchy throat' },
        { id: 'm-smoker', name: 'Zeca - Fumante (Chain)', base: 'M3', prompt: 'neutral tone, damaged vocal cords, wheezy, raspy' },
        { id: 'm-whisper', name: 'Sussurro - ASMR Masculino', base: 'M1', prompt: 'neutral tone, breathy texture, very low volume, close mic' },
        { id: 'm-fry', name: 'Luan - Vocal Fry', base: 'M1', prompt: 'neutral tone, creaky voice, relaxed vocal folds, lazy articulation' },
        
        // Idades
        { id: 'm-child', name: 'Pedrinho - Criança (Menino)', base: 'M1', prompt: 'neutral tone, high pitch, childish resonance, fast pace' },
        { id: 'm-teen', name: 'Dudu - Adolescente', base: 'M1', prompt: 'neutral tone, youthful pitch, breaking voice occasionally, energetic' },
        { id: 'm-young', name: 'Leo - Jovem Adulto', base: 'M1', prompt: 'neutral tone, bright timbre, energetic' },
        { id: 'm-mid', name: 'Henrique - Meia Idade', base: 'M2', prompt: 'neutral tone, mature timbre, steady pace' },
        { id: 'm-old', name: 'Vovô Joaquim - Idoso (60+)', base: 'M2', prompt: 'neutral tone, aged vocal cords, slightly shaky' },
        { id: 'm-ancient', name: 'Mestre Ancião - Sábio', base: 'M3', prompt: 'neutral tone, slow rhythm, wisdom, heavy resonance, very old' },
        
        // Profissões / Estilos de Fala
        { id: 'm-news', name: 'William - Jornalista TV', base: 'M1', prompt: 'neutral tone, news anchor style, clear projection, formal' },
        { id: 'm-sport', name: 'Galvão - Narrador Esportivo', base: 'M1', prompt: 'neutral tone, high energy projection, fast clear speech' },
        { id: 'm-radio', name: 'Locutor - Rádio FM', base: 'M2', prompt: 'neutral tone, compressed radio texture, rich bass, smiling voice' },
        { id: 'm-doc', name: 'Felipe - Documentário', base: 'M2', prompt: 'neutral tone, educational style, steady rhythm, BBC style' },
        { id: 'm-ad', name: 'Vendedor - Varejo Rápido', base: 'M1', prompt: 'neutral tone, fast paced, punchy, persuasive' },
        { id: 'm-meditate', name: 'Guru - Guia Meditação', base: 'M2', prompt: 'neutral tone, slow pace, soft, calming, hypnotic' },
        { id: 'm-preacher', name: 'Orador - Discurso / Político', base: 'M3', prompt: 'neutral tone, booming projection, echoic, authoritative' },

        // Personagens / Efeitos
        { id: 'm-robot', name: 'Robo-900 - Robô Clássico', base: 'M1', prompt: 'neutral tone, flat intonation, robotic rhythm, metallic texture' },
        { id: 'm-ai', name: 'Jarvis - IA Avançada', base: 'M1', prompt: 'neutral tone, synthetic but smooth, perfect diction, polite' },
        { id: 'm-alien', name: 'Zorg - Alienígena', base: 'M3', prompt: 'neutral tone, weird resonance, dual pitch, distorted' },
        { id: 'm-ghost', name: 'Espectro - Fantasma', base: 'M2', prompt: 'neutral tone, hollow resonance, distant sound, reverb-like' },
        { id: 'm-demon', name: 'Belial - Demoníaco', base: 'M3', prompt: 'neutral tone, double voice, deep growl, scary' },
        { id: 'm-nerd', name: 'Nerd - Anasalado', base: 'M1', prompt: 'neutral tone, high nasal resonance, pinched vocal tract' },
        { id: 'm-hero', name: 'Capitão - Herói de Ação', base: 'M2', prompt: 'neutral tone, breathy but strong, determined, movie protagonist' },
        { id: 'm-villain', name: 'Lorde - Vilão Elegante', base: 'M2', prompt: 'neutral tone, smooth, calculated, sinister undertone' },
        
        // Variações Específicas
        { id: 'm-drunk', name: 'Bebâdo - Embriagado', base: 'M3', prompt: 'neutral tone, slurred speech, slow, unstable pitch' },
        { id: 'm-cold', name: 'Gripado - Resfriado', base: 'M1', prompt: 'neutral tone, stuffed nose, congestion sound' },
        { id: 'm-fat', name: 'Grande - Voz Cheia', base: 'M3', prompt: 'neutral tone, cheek resonance, heavy breath' },
        { id: 'm-thin', name: 'Magro - Voz Fina', base: 'M1', prompt: 'neutral tone, thin texture, lack of bass' },
        { id: 'm-outbreath', name: 'Atleta - Sem Fôlego', base: 'M1', prompt: 'neutral tone, heavy breathing between words, running style' },
        { id: 'm-lazy', name: 'Preguiça - Relaxado', base: 'M2', prompt: 'neutral tone, slow drag, low energy' },
        { id: 'm-hyped', name: 'Youtuber - Hype!', base: 'M1', prompt: 'neutral tone, loud, energetic, punchy start' },
        { id: 'm-noir', name: 'Detetive - Noir', base: 'M3', prompt: 'neutral tone, inner monologue, gritty, cynical' },
        { id: 'm-phone', name: 'Fone - Telefone Antigo', base: 'M1', prompt: 'neutral tone, band-pass filter effect, lo-fi' },
        { id: 'm-megaphone', name: 'Guarda - Megafone', base: 'M1', prompt: 'neutral tone, distorted projection, echo, public address' },
        { id: 'm-cave', name: 'Caverna - Eco Profundo', base: 'M2', prompt: 'neutral tone, heavy echo, distant' },
        { id: 'm-mask', name: 'Bane - Mascarado', base: 'M3', prompt: 'neutral tone, muffled but loud, breathing apparatus sound' },
        { id: 'm-autotune', name: 'Trap - Autotune Sound', base: 'M1', prompt: 'neutral tone, slight pitch correction texture, melodic' },
        { id: 'm-sleepy', name: 'Sono - Sonolento', base: 'M1', prompt: 'neutral tone, yawning texture, slow' },
        { id: 'm-grumpy', name: 'Ranzinza - Rabugento', base: 'M3', prompt: 'neutral tone, growly, short sentences' },
        { id: 'm-shy', name: 'Junior - Tímido / Inseguro', base: 'M1', prompt: 'neutral tone, stuttery, quiet, hesitant' },
        { id: 'm-pirate', name: 'Pirata - Marujo', base: 'M3', prompt: 'neutral tone, rough, sea-shanty texture' },
        { id: 'm-cowboy', name: 'Cowboy - Texano', base: 'M2', prompt: 'neutral tone, drawl, gritty, western style' },
        { id: 'm-medieval', name: 'Cavaleiro - Medieval', base: 'M2', prompt: 'neutral tone, theatrical, old english style' },
        
        // Sutaques e Regionalismos (Novos)
        { id: 'm-dragged', name: 'Arrastado - Voz Lenta', base: 'M1', prompt: 'neutral tone, heavily drawn-out vowels, very slow drawl, lazy articulation' },
        { id: 'm-rural', name: 'Caipira - Interior', base: 'M1', prompt: 'neutral tone, rural countryside accent, distinct regional R sounds, singing cadence' },
        { id: 'm-northeast', name: 'Nordestino - Regional', base: 'M1', prompt: 'neutral tone, sharp northeastern regional accent, rhythmic cadence, distinct lilt' },
        { id: 'm-carioca', name: 'Carioca - Rio de Janeiro', base: 'M1', prompt: 'neutral tone, Rio de Janeiro accent, slushy S sounds, open vowels' },
        { id: 'm-gaúcho', name: 'Gaúcho - Sulista', base: 'M2', prompt: 'neutral tone, southern frontier accent, strong syllables, melodic lilt' },
        { id: 'm-british', name: 'Britânico - Posh', base: 'M1', prompt: 'neutral tone, refined British RP accent, non-rhotic, polite' },
        { id: 'm-american', name: 'Americano - Flat', base: 'M1', prompt: 'neutral tone, flat American accent, strong rhotic R sounds' },
        { id: 'm-french-acc', name: 'Francês - Melódico', base: 'M1', prompt: 'neutral tone, soft French transition accent, nasal vowels, melodic' },
        { id: 'm-italian-acc', name: 'Italiano - Expressivo', base: 'M2', prompt: 'neutral tone, expressive Italian transition accent, dramatic energy' },
        { id: 'm-portugal', name: 'Portugal - Europeu', base: 'M1', prompt: 'neutral tone, European Portuguese lilt, closed vowels, rhythmic cadence' }
    ];

    // --- TONALIDADES FEMININAS (45 Variações Físicas) ---
    const feminineTones = [
         // Realista / Padrão
        { id: 'f-std', name: 'Maria - Padrão (Neutro)', base: 'F1', prompt: 'neutral tone, standard female pitch, clear articulation' },
        { id: 'f-soft', name: 'Julia - Suave / Delicada', base: 'F2', prompt: 'neutral tone, high breathiness, soft texture, light vocal weight' },
        { id: 'f-pro', name: 'Ana - Profissional / Executiva', base: 'F1', prompt: 'neutral tone, confident, sharp diction, fast pace, business-like' },
        { id: 'f-casual', name: 'Carla - Casual / Amiga', base: 'F1', prompt: 'neutral tone, relaxed, conversational, warm' },

        // Graves e Agudos
        { id: 'f-deep', name: 'Fernanda - Grave (Contralto)', base: 'F1', prompt: 'neutral tone, low female pitch, chest resonance, authoritative' },
        { id: 'f-husk', name: 'Jazz - Rouca Sexy', base: 'F2', prompt: 'neutral tone, husky texture, smoky timbre, vocal fry' },
        { id: 'f-high', name: 'Soprano - Aguda Limpa', base: 'F2', prompt: 'neutral tone, very high pitch, head voice, crystal clear' },
        { id: 'f-pierce', name: 'Aguda - Penetrante', base: 'F2', prompt: 'neutral tone, piercing high pitch, loud projection' },
        
        // Idades
        { id: 'f-child', name: 'Aninha - Menina Pequena', base: 'F2', prompt: 'neutral tone, very high pitch, childish resonance, fast pace' },
        { id: 'f-teen', name: 'Bia - Adolescente (Valley)', base: 'F2', prompt: 'neutral tone, uptalk, vocal fry, energetic' },
        { id: 'f-young', name: 'Gabi - Jovem Adulta', base: 'F1', prompt: 'neutral tone, bright timbre, clear' },
        { id: 'f-mom', name: 'Mãe - Maternal / Doce', base: 'F1', prompt: 'neutral tone, warm resonance, comforting timbre' },
        { id: 'f-aunt', name: 'Tia - Madura', base: 'F1', prompt: 'neutral tone, mature, steady' },
        { id: 'f-grandma', name: 'Vovó - Doce / Idosa', base: 'F1', prompt: 'neutral tone, aged vocal cords, slower pace, lower energy, kind' },
        { id: 'f-witch', name: 'Bruxa - Malvada', base: 'F2', prompt: 'neutral tone, creaky voice, cackle texture, sharp' },

        // Profissões
        { id: 'f-news', name: 'Renata - Jornalista', base: 'F1', prompt: 'neutral tone, projected voice, articulate, formal, broadcast style' },
        { id: 'f-gps', name: 'Siri - Assistente / GPS', base: 'F1', prompt: 'neutral tone, synthetic texture, perfect rhythm, emotionless' },
        { id: 'f-flight', name: 'Comissária - Avião', base: 'F1', prompt: 'neutral tone, polite, airy, announcing style' },
        { id: 'f-audiobook', name: 'Narradora - Livros', base: 'F1', prompt: 'neutral tone, engaging, clear, storytelling style' },
        { id: 'f-yoga', name: 'Zen - Instrutora Yoga', base: 'F2', prompt: 'neutral tone, very slow, breathy, calming, whispery' },
        { id: 'f-phone', name: 'Telefonista - Atendimento', base: 'F1', prompt: 'neutral tone, filtered texture, polite intonation, repetitive' },
        
        // Texturas e Efeitos
        { id: 'f-asmr', name: 'Sussurro - ASMR Feminino', base: 'F2', prompt: 'neutral tone, extremely breathy, whisper only, close microphone' },
        { id: 'f-fry', name: 'Leticia - Vocal Fry', base: 'F1', prompt: 'neutral tone, heavy vocal fry, casual, relaxed' },
        { id: 'f-nasal', name: 'Fina - Anasalada', base: 'F2', prompt: 'neutral tone, high nasal resonance, complaining texture' },
        { id: 'f-robotic', name: 'EVE - Robô Fêmea', base: 'F1', prompt: 'neutral tone, metallic, flat pitch, glitchy' },
        { id: 'f-ethereal', name: 'Fada - Etérea', base: 'F2', prompt: 'neutral tone, echo-like quality, very light, spiritual resonance' },
        { id: 'f-ghost', name: 'Alma - Fantasma', base: 'F2', prompt: 'neutral tone, hollow, reverb, distant, weeping texture' },
        { id: 'f-siren', name: 'Sereia - Hipnótica', base: 'F2', prompt: 'neutral tone, melodic, hypnotic, watery texture' },
        { id: 'f-anime', name: 'Yumi - Kawaii / Anime', base: 'F2', prompt: 'neutral tone, exaggerated high pitch, energetic, cute' },
        { id: 'f-queen', name: 'Rainha - Majestosa', base: 'F1', prompt: 'neutral tone, posh, authoritative, slow, elegant' },

        // Variações Específicas
        { id: 'f-sick', name: 'Doente - Gripada', base: 'F1', prompt: 'neutral tone, congested, sniffing, low energy' },
        { id: 'f-tired', name: 'Cansada - Exausta', base: 'F1', prompt: 'neutral tone, sighing, heavy breath, slow' },
        { id: 'f-happy', name: 'Alegre - Sorridente', base: 'F2', prompt: 'neutral tone, bright, smiling texture, high cheekbones' },
        { id: 'f-sad', name: 'Luna - Triste', base: 'F1', prompt: 'neutral tone, breaking voice, slow, quiet' },
        { id: 'f-hysteric', name: 'Desesperada - Histérica', base: 'F2', prompt: 'neutral tone, unstable pitch, fast, erratic' },
        { id: 'f-gossip', name: 'Fofoca - Curiosa', base: 'F2', prompt: 'neutral tone, hushed but excited, fast, whisper-shout' },
        { id: 'f-scary', name: 'Samara - Assustadora', base: 'F2', prompt: 'neutral tone, flat, creepy, slow, monotone' },
        { id: 'f-noir', name: 'Femme Fatale - Noir', base: 'F1', prompt: 'neutral tone, low, breathy, slow, seductive texture' },
        { id: 'f-teacher', name: 'Professora - Aula', base: 'F1', prompt: 'neutral tone, clear, instructional, enunciated' },
        { id: 'f-kpop', name: 'Idol - Girl Group', base: 'F2', prompt: 'neutral tone, bright, poppy, energetic' },
        { id: 'f-villain', name: 'Malu - Vilã Dramática', base: 'F1', prompt: 'neutral tone, dramatic, deep, laughing texture' },
        { id: 'f-elf', name: 'Elfa - Mística', base: 'F2', prompt: 'neutral tone, wise, light, ancient' },
        { id: 'f-soldier', name: 'Comandante - Soldada', base: 'F1', prompt: 'neutral tone, shouting, rough, authoritative' },
        { id: 'f-radio', name: 'Locutora - Rádio FM', base: 'F1', prompt: 'neutral tone, rich, compressed, smooth' },
        { id: 'f-opera', name: 'Diva - Ópera', base: 'F1', prompt: 'neutral tone, intense vibrato, projected, dramatic' },
        
        // Sutaques e Regionalismos (Novos)
        { id: 'f-dragged', name: 'Arrastada - Voz Lenta', base: 'F1', prompt: 'neutral tone, heavily drawn-out vowels, very slow drawl, lazy articulation' },
        { id: 'f-rural', name: 'Caipira - Interior', base: 'F1', prompt: 'neutral tone, rural countryside accent, distinct regional R sounds, singing cadence' },
        { id: 'f-northeast', name: 'Nordestina - Regional', base: 'F1', prompt: 'neutral tone, sharp northeastern regional accent, rhythmic cadence, distinct lilt' },
        { id: 'f-carioca', name: 'Carioca - Rio de Janeiro', base: 'F1', prompt: 'neutral tone, Rio de Janeiro accent, slushy S sounds, open vowels' },
        { id: 'f-gaúcho', name: 'Gaúcha - Sulista', base: 'F1', prompt: 'neutral tone, southern frontier accent, strong syllables, melodic lilt' },
        { id: 'f-british', name: 'Britânica - Posh', base: 'F1', prompt: 'neutral tone, refined British RP accent, non-rhotic, polite' },
        { id: 'f-american', name: 'Americana - Flat', base: 'F1', prompt: 'neutral tone, flat American accent, strong rhotic R sounds' },
        { id: 'f-french-acc', name: 'Francesa - Melódica', base: 'F1', prompt: 'neutral tone, soft French transition accent, nasal vowels, melodic' },
        { id: 'f-italian-acc', name: 'Italiana - Expressiva', base: 'F1', prompt: 'neutral tone, expressive Italian transition accent, dramatic energy' },
        { id: 'f-portugal', name: 'Portugal - Europeu', base: 'F1', prompt: 'neutral tone, European Portuguese lilt, closed vowels, rhythmic cadence' }
    ];

    let voices = [];
    
    languages.forEach((lang) => {
        // Masculinos
        masculineTones.forEach((style) => {
            voices.push({
                id: `${lang.id}:${style.id}`, name: `${style.name}`, base: bases[style.base],
                langId: lang.id,
                category: `${lang.name} - Masculino`, style: `${lang.prompt}, ${style.prompt}`
            });
        });

        // Femininos
        feminineTones.forEach((style) => {
            voices.push({
                id: `${lang.id}:${style.id}`, name: `${style.name}`, base: bases[style.base],
                langId: lang.id,
                category: `${lang.name} - Feminino`, style: `${lang.prompt}, ${style.prompt}`
            });
        });
    });

    return voices;
};

// --- MASSIVE TEXT TEMPLATE GENERATOR (300+ MODELS) ---
const generateTextTemplates = () => {
    const templates = [];
    const categories = [
        { id: 'viral', name: '🔥 Viral & Shorts', colors: ['#FF0050', '#00F2EA', '#FFFFFF'], fonts: ['Montserrat', 'Bebas Neue', 'Anton'] },
        { id: 'neon', name: '🌃 Neon & Cyber', colors: ['#FF00FF', '#00FFFF', '#FFFF00'], fonts: ['Orbitron', 'Monoton', 'Audiowide'] },
        { id: 'minimal', name: '✨ Minimal & Clean', colors: ['#FFFFFF', '#000000', '#333333'], fonts: ['Inter', 'Roboto', 'Lato'] },
        { id: 'cinema', name: '🎬 Cinematic', colors: ['#E5E7EB', '#FFD700', '#C0C0C0'], fonts: ['Cinzel', 'Playfair Display', 'Lora'] },
        { id: 'gaming', name: '🎮 Gaming & Stream', colors: ['#00FF00', '#FF0000', '#8A2BE2'], fonts: ['Press Start 2P', 'Black Ops One', 'Permanent Marker'] },
        { id: 'retro', name: '📼 Retro & 80s', colors: ['#FF6B6B', '#4ECDC4', '#FFE66D'], fonts: ['Righteous', 'Lobster', 'Pacifico'] },
        { id: '3d', name: '🧊 3D & Pop', colors: ['#FFC107', '#FF5722', '#2196F3'], fonts: ['Luckiest Guy', 'Carter One', 'Fredoka One'] },
        { id: 'news', name: '📰 News & Info', colors: ['#D32F2F', '#1976D2', '#FFFFFF'], fonts: ['Oswald', 'Roboto Condensed', 'Fjalla One'] },
        { id: 'vlog', name: '📹 Vlog & Life', colors: ['#FF8A80', '#A7FFEB', '#FFFF8D'], fonts: ['Amatic SC', 'Caveat', 'Indie Flower'] }
    ];

    const animations = ['pop-in', 'fade-in', 'slide-in-left', 'slide-in-right', 'zoom-in', 'typewriter-step', 'glitch-anim', 'elastic', 'swing', 'blur-in'];
    const effects = ['neon-glow-cyan', '3d-pop', 'outline-black', 'shadow-soft', 'glitch-art', 'gradient-gold', 'gradient-fire', 'gradient-ocean'];

    let count = 1;

    // 1. Procedural Combinations
    categories.forEach(cat => {
        // Basic Variations
        cat.fonts.forEach(font => {
            // Solid Colors
            cat.colors.forEach(color => {
                templates.push({
                    id: `${cat.id}_basic_${count++}`,
                    name: `${cat.name} ${count}`,
                    category: cat.name,
                    styleId: font,
                    design: {
                        color: color,
                        animation: { in: animations[count % animations.length], out: 'fade-out' }
                    }
                });

                // Outlined
                templates.push({
                    id: `${cat.id}_outline_${count++}`,
                    name: `${cat.name} Outline ${count}`,
                    category: cat.name,
                    styleId: font,
                    design: {
                        color: 'transparent',
                        stroke: { width: 4, color: color },
                        animation: { in: animations[count % animations.length] }
                    }
                });
            });

            // Effect Variations
            effects.forEach(effect => {
                templates.push({
                    id: `${cat.id}_fx_${count++}`,
                    name: `${cat.name} FX ${count}`,
                    category: cat.name,
                    styleId: font,
                    design: {
                        color: '#FFFFFF',
                        effectId: effect,
                        animation: { in: animations[count % animations.length], loop: count % 3 === 0 ? 'pulse' : undefined }
                    }
                });
            });
        });
    });

    // 2. Specific High-Quality Hand-Crafted Templates (Karaoke, Titles)
    const specialTemplates = [
        { id: 'hormozi_1', name: 'Hormozi Pop', category: '🔥 Viral & Shorts', styleId: 'Anton', design: { color: '#ffffff', animation: { in: 'pop-in' }, stroke: {width: 4, color: 'black'}, shadow: {x:3, y:3, blur:0, color:'black'} } },
        { id: 'hormozi_2', name: 'Dynamic High-Energy', category: '🔥 Viral & Shorts', styleId: 'Montserrat', design: { color: '#ffffff', animation: { in: 'zoom-bounce' }, stroke: {width: 3, color: 'black'}, shadow: {x:2, y:2, blur:4, color:'rgba(0,0,0,0.8)'} } },
        { id: 'hormozi_3', name: 'Alex Style', category: '🔥 Viral & Shorts', styleId: 'Bebas Neue', design: { color: '#FFD700', animation: { in: 'elastic' }, stroke: {width: 0, color: 'transparent'}, shadow: {x:4, y:4, blur:0, color:'black'} } },
        { id: 'sub_karaoke_1', name: 'Karaoke Gold', category: '🎤 Legendas Dinâmicas', styleId: 'Montserrat', design: { color: '#FFD700', animation: { loop: 'karaoke' }, stroke: {width: 2, color: 'black'}, shadow: {x:2, y:2, blur:0, color:'black'} } },
        { id: 'sub_karaoke_2', name: 'Karaoke Blue', category: '🎤 Legendas Dinâmicas', styleId: 'Anton', design: { color: '#00FFFF', animation: { loop: 'karaoke-blue' }, stroke: {width: 4, color: 'black'} } },
        { id: 'sub_word_1', name: 'Palavra por Palavra', category: '🎤 Legendas Dinâmicas', styleId: 'Bebas Neue', design: { color: 'white', backgroundColor: 'black', animation: { in: 'pop-in' } } },
        { id: 'title_big_1', name: 'BIG TITLE', category: '🔥 Viral & Shorts', styleId: 'Anton', design: { color: 'white', backgroundColor: '#FF0000', stroke: {width:0, color:'transparent'}, shadow: {x:5, y:5, blur:0, color:'black'}, animation: { in: 'elastic' } } },
        { id: 'title_neon_1', name: 'NEON NIGHT', category: '🌃 Neon & Cyber', styleId: 'Monoton', design: { color: '#FF00FF', effectId: 'neon-glow-cyan', animation: { loop: 'flicker' } } },
        // --- MOTION GRAPHICS (LOWER THIRDS & PROGRESS BARS) ---
        { id: 'lt_modern_1', name: 'Lower Third Modern Blue', category: '📦 Motion Graphics', styleId: 'Montserrat', design: { isLowerThird: true, color: 'white', backgroundColor: '#0066FF', animation: { in: 'slide-in-left' }, shadow: {x:2, y:2, blur:4, color:'black'} } },
        { id: 'lt_tech_1', name: 'Lower Third Cyber Neon', category: '📦 Motion Graphics', styleId: 'Orbitron', design: { isLowerThird: true, color: '#00FFFF', backgroundColor: 'rgba(0,0,0,0.7)', animation: { in: 'fade-in' }, stroke: {width: 1, color: '#00FFFF'} } },
        { id: 'lt_minimal_1', name: 'Lower Third Clean', category: '📦 Motion Graphics', styleId: 'Inter', design: { isLowerThird: true, color: 'white', backgroundColor: 'transparent', animation: { in: 'slide-up' } } },
        { id: 'pb_viral_1', name: 'Progress Bar Viral (Red)', category: '📦 Motion Graphics', styleId: 'Inter', design: { isProgressBar: true, color: '#FF0050', backgroundColor: 'rgba(0,0,0,0.3)' } },
        { id: 'pb_eco_1', name: 'Progress Bar Nature', category: '📦 Motion Graphics', styleId: 'Inter', design: { isProgressBar: true, color: '#00FF00', backgroundColor: 'rgba(255,255,255,0.1)' } },
        { id: 'pb_gradient_1', name: 'Progress Bar Rainbow', category: '📦 Motion Graphics', styleId: 'Inter', design: { isProgressBar: true, background: 'linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet)', backgroundColor: 'rgba(0,0,0,0.5)' } },
    ];

    return [...specialTemplates, ...templates];
};

// --- EXPANDED TEXT EFFECTS (100+) ---
const generateTextEffects = () => {
    const baseEffects = [
        { id: 'none', name: 'Nenhum', class: '' },
        { id: 'shadow-soft', name: 'Sombra Suave', customStyle: { textShadow: '2px 2px 4px rgba(0,0,0,0.5)' } },
        { id: 'shadow-hard', name: 'Sombra Dura', customStyle: { textShadow: '4px 4px 0px #000000' } },
        { id: 'outline-black', name: 'Contorno Preto', customStyle: { WebkitTextStroke: '2px black' } },
        { id: 'outline-white', name: 'Contorno Branco', customStyle: { WebkitTextStroke: '2px white', color: 'black' } },
        { id: 'neon-glow-pink', name: 'Neon Rosa', customStyle: { textShadow: '0 0 5px #FF00FF, 0 0 10px #FF00FF, 0 0 20px #FF00FF' } },
        { id: '3d-pop', name: '3D Pop', class: 'text-3d-pop' },
        { id: 'gradient-gold', name: 'Ouro', class: 'text-gradient-gold' },
        { id: 'gradient-silver', name: 'Prata', class: 'text-gradient-silver' },
        { id: 'gradient-fire', name: 'Fogo', class: 'text-gradient-fire' },
        { id: 'gradient-ocean', name: 'Oceano', class: 'text-gradient-ocean' },
        { id: 'glitch-art', name: 'Glitch', class: 'art-glitch' },
        { id: 'letter-space', name: 'Espaçado', customStyle: { letterSpacing: '0.2em' } },
        { id: 'bg-highlight', name: 'Marca Texto', customStyle: { backgroundColor: 'yellow', color: 'black', padding: '0 4px' } }
    ];

    const generatedEffects = [];
    const colors = [
        {name: 'Red', hex: '#ff0000'}, {name: 'Blue', hex: '#0000ff'}, {name: 'Green', hex: '#00ff00'}, 
        {name: 'Purple', hex: '#800080'}, {name: 'Orange', hex: '#ffa500'}, {name: 'Teal', hex: '#008080'},
        {name: 'HotPink', hex: '#FF69B4'}, {name: 'Lime', hex: '#00FF00'}, {name: 'Cyan', hex: '#00FFFF'},
        {name: 'Gold', hex: '#FFD700'}, {name: 'Silver', hex: '#C0C0C0'}, {name: 'Crimson', hex: '#DC143C'},
        {name: 'DeepSkyBlue', hex: '#00BFFF'}, {name: 'Magenta', hex: '#FF00FF'}, {name: 'Yellow', hex: '#FFFF00'}
    ];

    // Procedural Neon (30+)
    colors.forEach(c => {
        generatedEffects.push({
            id: `neon-glow-${c.name.toLowerCase()}`,
            name: `Neon ${c.name}`,
            customStyle: { textShadow: `0 0 5px ${c.hex}, 0 0 10px ${c.hex}, 0 0 20px ${c.hex}, 0 0 40px ${c.hex}`, color: '#ffffff' }
        });
        generatedEffects.push({
            id: `neon-soft-${c.name.toLowerCase()}`,
            name: `Soft ${c.name}`,
            customStyle: { textShadow: `0 0 10px ${c.hex}`, color: '#ffffff' }
        });
        generatedEffects.push({
            id: `neon-intense-${c.name.toLowerCase()}`,
            name: `Intense ${c.name}`,
            customStyle: { textShadow: `0 0 5px #fff, 0 0 10px #fff, 0 0 20px ${c.hex}, 0 0 30px ${c.hex}, 0 0 40px ${c.hex}`, color: '#ffffff' }
        });
    });

    // Procedural Outlines (20+)
    colors.forEach(c => {
        generatedEffects.push({
            id: `outline-${c.name.toLowerCase()}`,
            name: `Out ${c.name}`,
            customStyle: { WebkitTextStroke: `2px ${c.hex}`, color: 'transparent' }
        });
        generatedEffects.push({
            id: `outline-fill-${c.name.toLowerCase()}`,
            name: `Fill ${c.name}`,
            customStyle: { WebkitTextStroke: `2px ${c.hex}`, color: 'white' }
        });
        generatedEffects.push({
            id: `outline-thick-${c.name.toLowerCase()}`,
            name: `Thick ${c.name}`,
            customStyle: { WebkitTextStroke: `4px ${c.hex}`, color: 'transparent' }
        });
    });

    // Procedural 3D (20+)
    colors.forEach(c => {
        generatedEffects.push({
            id: `3d-${c.name.toLowerCase()}`,
            name: `3D ${c.name}`,
            customStyle: { 
                textShadow: `1px 1px 0px ${c.hex}, 2px 2px 0px ${c.hex}, 3px 3px 0px ${c.hex}, 4px 4px 0px ${c.hex}`,
                color: 'white'
            }
        });
        generatedEffects.push({
            id: `3d-deep-${c.name.toLowerCase()}`,
            name: `Deep ${c.name}`,
            customStyle: { 
                textShadow: `1px 1px 0px ${c.hex}, 2px 2px 0px ${c.hex}, 3px 3px 0px ${c.hex}, 4px 4px 0px ${c.hex}, 5px 5px 0px ${c.hex}, 6px 6px 0px ${c.hex}`,
                color: 'white'
            }
        });
    });

    // Procedural Gradients (20+)
    const gradients = [
        {name: 'Sunset', val: 'linear-gradient(to bottom, #ff5e62, #ff9966)'},
        {name: 'Night', val: 'linear-gradient(to bottom, #232526, #414345)'},
        {name: 'Matrix', val: 'linear-gradient(to bottom, #00F260, #0575E6)'},
        {name: 'Lush', val: 'linear-gradient(to bottom, #56ab2f, #a8e063)'},
        {name: 'Royal', val: 'linear-gradient(to bottom, #141E30, #243B55)'},
        {name: 'Candy', val: 'linear-gradient(to bottom, #FF416C, #FF4B2B)'},
        {name: 'Deep Space', val: 'linear-gradient(to bottom, #000000, #434343)'},
        {name: 'Citrus', val: 'linear-gradient(to bottom, #FDC830, #F37335)'},
        {name: 'Cotton Candy', val: 'linear-gradient(to right, #ff99cc, #66ccff)'},
        {name: 'Rainbow', val: 'linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet)'},
        {name: 'Aurora', val: 'linear-gradient(to top, #00c6ff, #0072ff)'},
        {name: 'Fire', val: 'linear-gradient(to bottom, #f12711, #f5af19)'},
        {name: 'Ocean', val: 'linear-gradient(to top, #2b5876, #4e4376)'},
        {name: 'Forest', val: 'linear-gradient(to top, #134e5e, #71b280)'},
        {name: 'Gold', val: 'linear-gradient(to bottom, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c)'},
        {name: 'Chrome', val: 'linear-gradient(to bottom, #333, #eee, #333)'}
    ];

    gradients.forEach(g => {
        generatedEffects.push({
            id: `grad-${g.name.toLowerCase().replace(' ', '-')}`,
            name: `Grad ${g.name}`,
            customStyle: {
                background: g.val,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                color: 'transparent'
            }
        });
    });

    // Procedural Glitch Variations (10+)
    colors.slice(0, 5).forEach(c => {
         generatedEffects.push({
            id: `glitch-static-${c.name.toLowerCase()}`,
            name: `Glitch ${c.name}`,
            customStyle: { textShadow: `2px 0 ${c.hex}, -2px 0 blue` },
            class: 'art-glitch'
        });
    });

    return [...baseEffects, ...generatedEffects];
};

const generateTextAnimations = () => ({
    in: [
        { id: 'none', name: 'Nenhuma' },
        { id: 'fade-in', name: 'Fade In', class: 'anim-fade-in' },
        { id: 'pop-in', name: 'Pop In', class: 'text-in-pop' },
        { id: 'zoom-in', name: 'Zoom In', class: 'anim-zoom-in' },
        { id: 'slide-up', name: 'Slide Cima', class: 'anim-slide-up' },
        { id: 'slide-down', name: 'Slide Baixo', class: 'text-in-slide-down' },
        { id: 'slide-left', name: 'Slide Esq.', class: 'anim-slide-in-left' },
        { id: 'slide-right', name: 'Slide Dir.', class: 'text-in-slide-right' },
        { id: 'typewriter-step', name: 'Datilógrafo', class: 'text-in-typewriter-step' },
        { id: 'typewriter-smooth', name: 'Digitar Suave', class: 'text-in-typewriter-smooth' },
        { id: 'glitch-anim', name: 'Glitch In', class: 'text-in-glitch-anim' },
        { id: 'elastic', name: 'Elástico', class: 'text-in-elastic' },
        { id: 'swing', name: 'Swing', class: 'text-in-swing' },
        { id: 'blur-in', name: 'Focar', class: 'text-in-focus' },
        { id: 'whip-in', name: 'Whip Pan', class: 'whip-pan-in' },
        { id: 'bounce-in', name: 'Bounce', class: 'anim-bounce-in' },
        { id: 'tracking-in', name: 'Tracking', class: 'anim-tracking-in' },
        { id: 'rotate-in', name: 'Girar', class: 'anim-rotate-in' },
        { id: 'flip-x', name: 'Flip X', class: 'anim-flip-in-x' },
        { id: 'flip-y', name: 'Flip Y', class: 'anim-flip-in-y' },
        { id: 'roll-in', name: 'Rolar', class: 'anim-roll-in' },
        { id: 'light-speed', name: 'Vel. Luz', class: 'anim-light-speed-in' },
        { id: 'puff-in', name: 'Puff', class: 'anim-puff-in' },
        { id: 'vanish-in', name: 'Vanish', class: 'anim-vanish-in' }
    ],
    out: [
        { id: 'none', name: 'Nenhuma' },
        { id: 'fade-out', name: 'Fade Out', class: 'anim-fade-out' },
        { id: 'zoom-out', name: 'Zoom Out', class: 'anim-zoom-out' },
        { id: 'slide-out-up', name: 'Sair Cima', class: 'text-out-slide-up' },
        { id: 'slide-out-down', name: 'Sair Baixo', class: 'text-out-slide-down' },
        { id: 'whip-out', name: 'Whip Sair', class: 'whip-pan-out' }
    ],
    loop: [
        { id: 'none', name: 'Nenhuma' },
        { id: 'pulse', name: 'Pulsar', class: 'text-loop-pulse' },
        { id: 'wiggle', name: 'Tremer', class: 'text-loop-wiggle' },
        { id: 'shake', name: 'Chacoalhar', class: 'text-loop-shake' },
        { id: 'float', name: 'Flutuar', class: 'text-loop-float' },
        { id: 'neon-pulse', name: 'Neon Pulse', class: 'text-loop-neon' },
        { id: 'rainbow', name: 'Arco-íris', class: 'text-loop-rainbow' },
        { id: 'karaoke', name: 'Karaoke (Ouro)', class: 'text-anim-karaoke' },
        { id: 'karaoke-blue', name: 'Karaoke (Azul)', class: 'text-anim-karaoke-blue' }
    ]
});

// --- MASSIVE IMAGE STYLE LIST (PORTUGUÊS) ---
export const IMAGE_STYLE_CATEGORIES = {
    "Populares & Destaques": [
        "Futurista Alta Tecnologia", "Fantasia Épica", "Boneco de Palito", "Cinematográfico 4K",
        "Fotorealista em 8K", "Disney Pixar 3D", "Anime do Studio Ghibli", "Filme Vintage 8mm",
        "Cyberpunk Neon", "estilo Minecraft", "LEGO Stop Motion", "Esboço em Papel",
        "Retrato hiper-realista", "Cena de Guerra Épica", "Efeitos do Portal Mágico"
    ],
    "3D e CGI": [
        "Papercraft Tátil", "Lego Technic", "Metal Líquido", "Caixa de Diorama",
        "Renderização de Próxima Geração do UE5", "Escaneamento 3D", "Brinquedo de Plástico",
        "Vidro Fosco", "Pelúcia 3D Soft", "Estrutura de arame de néon", "Octane Alto Brilho",
        "Massinha (Clay)", "Arte Voxel (Pixels 3D)", "Blender Cycles HQ", "Low Poly Isométrico"
    ],
    "Fotografia & Lentes": [
        "Ação de Drone FPV", "Super Macro 100x", "Subaquático Profundo", "Olho de Peixe Extremo",
        "Miniatura Tilt-Shift", "Visão Térmica (Heat)", "Infravermelho Surreal", "Dupla Exposição",
        "Visão Noturna Geração 3", "Planeta Minúsculo 360°", "Visão do drone DJI",
        "Macro Natureza HQ", "Longa Exposição", "Noir P&B Profundo", "Golden Hour Retrato"
    ],
    "Estética e Ambiente": [
        "Piscina Dreamcore", "Weirdcore Surreal", "Espaço Liminar", "Cidade Solarpunk",
        "Cyberpunk Beco", "Gothcore Sombrio", "Sonho Cottagecore", "Academia Sombria",
        "Praia Vaporwave", "Noite Synthwave", "Pastel Kawaii", "Psicodélico (Trip)",
        "Steampunk / Vapor", "Arte com falhas / Erro", "Zen Minimalista"
    ],
    "Jogos & Digital": [
        "PS1 Retro 32 bits", "Era PS2/GameCube", "Xbox 360 Bloom", "GBA portátil de 16 bits",
        "Arte em pixel HD de 32 bits", "Minecraft RTX LIGADO", "Jogo Cyberpunk 2077",
        "GTA V / Los Santos", "Realismo de Red Dead", "Elden Ring / Souls", "Nintendo 64 Clássico",
        "Game Boy Ponto Verde", "Mundo Roblox", "Fortnite Battle Royale", "Breath of the Wild",
        "Half-Life 2 / Fonte", "Valorant Estilizado", "Overwatch / Blizzard", "Fazenda Stardew Valley",
        "Remake de Final Fantasy", "Pixel Art 8 bits", "Tela de carregamento do GTA",
        "Super Mario SNES", "Aparência de Elden Ring", "Arcane (Netflix)"
    ],
    "Realismo e Urbano": [
        "Tóquio Neon", "Vida nas ruas de Nova York", "Gueto Futurista", "Industrial / Ferrugem",
        "Arranha-céu / Vidro", "Foto de rua P&B", "Brutalismo", "Shopping Abandonado",
        "Luxo / Cobertura", "Subúrbio Golden Hour", "Tóquio Noite Neon", "Metrópole Sci-Fi",
        "Mega Brutalismo", "Cidade Oásis", "Vila Antiga Europeia"
    ],
    "Estilo vintage e retrô": [
        "Cinema Mudo 1920", "Technicolor 1950", "Foto Polaroid Instax", "Documentário de Guerra",
        "Televisão de tubo de raios catódicos (CRT)", "View-Master 3D", "Filme caseiro 16mm",
        "Tintipo / Século XIX", "Rastreamento VHS", "Cartão Postal Retrô", "Kodak Portra 400",
        "Nostalgia do Super 8", "VHS Anos 80", "Polaroid Desbotada", "Sépia Vitoriano"
    ],
    "Gravura Vintage": [
        "Cascalho Metálico", "Xilogravura Rústica", "Litografia Botânica", "Gravura de Cédula",
        "Esboço Enciclopédia", "Cartografia Antiga", "Cianótipo", "Manuscrito de Da Vinci",
        "HQ Clássica 1950", "Gravura Renascentista"
    ],
    "Cinema e Realismo": [
        "IMAX 70mm", "Ação Hollywood", "Christopher Nolan", "Wes Anderson", "Quentin Tarantino",
        "Estilo Tim Burton", "Denis Villeneuve", "Documentário BBC", "Câmera Segurança", "Jornalismo TV"
    ],
    "Animação & Cartoon": [
        "Anime Anos 90", "Anime Shinkai", "Cartoon Network", "Rick e Morty", "Os Simpsons",
        "South Park", "Looney Tunes", "Quadrinhos Marvel", "Capa P&B", "Estilo Webtoon",
        "Doodle Caderno", "Desenho animado", "Clássico 2D da Disney", "As Meninas Superpoderosas",
        "Hora de Aventura"
    ],
    "Arte Clássica & Pintura": [
        "Van Gogh / Óleo", "Aquarela Suave", "Claude Monet", "Salvador Dali", "Picasso / Cubismo",
        "Da Vinci / Renascença", "Ukiyo-e (Japonês)", "Arte Gótica", "Vitral Igreja", "Afresco Antigo",
        "Pintura Rupestre", "Esboço Carvão", "Desenho Lápis Cor", "Tinta Nanquim", "Pop Art / Warhol"
    ],
    "Materiais & Texturas": [
        "Papelão", "Origami", "Fumaça", "Fogo", "Água", "Gelo / Cristal", "Areia", "Comida",
        "Tricô / Lã", "Bordado", "Mosaic", "Giz no Quadro", "Luz Neon", "Arte Balão"
    ]
};

export const IMAGE_STYLES = Object.values(IMAGE_STYLE_CATEGORIES).flat();

// --- GENERATING 200+ EFFECTS ---
const generateMassiveEffects = () => {
    const effects = {};
    
    // 1. Color Grading (50)
    effects['Color Grade (50+)'] = {};
    for(let i=1; i<=50; i++) {
        // Procedural variation
        const contrast = 1 + (i%5)*0.1;
        const sat = 1 + (i%3)*0.2;
        const hue = (i * 15) % 360;
        effects['Color Grade (50+)'][`cg-pro-${i}`] = { 
            name: `Grade Pro ${i}`, 
            filter: `contrast(${contrast}) saturate(${sat}) hue-rotate(${hue}deg)` 
        };
    }

    // 2. Vintage (30)
    effects['Vintage & Retro (30+)'] = {};
    for(let i=1; i<=30; i++) {
        const sepia = 0.3 + (i%5)*0.1;
        effects['Vintage & Retro (30+)'][`vintage-style-${i}`] = { 
            name: `Vintage ${i}`, 
            filter: `sepia(${sepia}) contrast(0.9) brightness(1.1)` 
        };
    }

    // 3. Cyberpunk (20)
    effects['Cyberpunk (20+)'] = {};
    for(let i=1; i<=20; i++) {
        effects['Cyberpunk (20+)'][`cyber-neon-${i}`] = { 
            name: `Cyber ${i}`, 
            filter: `contrast(1.3) saturate(1.5) hue-rotate(${i*10}deg) drop-shadow(0 0 5px cyan)` 
        };
    }

    // 4. Nature (20)
    effects['Nature & Fresh (20+)'] = {};
    for(let i=1; i<=20; i++) {
        effects['Nature & Fresh (20+)'][`nature-fresh-${i}`] = { 
            name: `Nature ${i}`, 
            filter: `saturate(1.4) brightness(1.05) hue-rotate(-${i*2}deg)` 
        };
    }

    // 5. Artistic Duotone (30)
    effects['Duotone & Art (30+)'] = {};
    for(let i=1; i<=30; i++) {
        // Simulating duotone with extreme hue/sat
        effects['Duotone & Art (30+)'][`art-duo-${i}`] = { 
            name: `Duotone ${i}`, 
            filter: `grayscale(1) contrast(1.5) sepia(1) hue-rotate(${i*12}deg) saturate(3)` 
        };
    }

    // 6. Lights & Leaks (20) - Uses CSS gradients as overlay classes
    effects['Light Leaks (20+)'] = {};
    for(let i=1; i<=20; i++) {
        effects['Light Leaks (20+)'][`leak-overlay-${i}`] = { 
            name: `Leak ${i}`, 
            overlayClass: `eff-leak-${i}` // Will be defined in CSS
        };
    }

    // 7. B&W Noir (20)
    effects['Noir & Mono (20+)'] = {};
    for(let i=1; i<=20; i++) {
        effects['Noir & Mono (20+)'][`noir-style-${i}`] = { 
            name: `Noir ${i}`, 
            filter: `grayscale(1) contrast(${1 + i*0.05}) brightness(${1 - i*0.02})` 
        };
    }

    // 8. Film Stock (20)
    effects['Film Stock (20+)'] = {};
    for(let i=1; i<=20; i++) {
        effects['Film Stock (20+)'][`film-stock-${i}`] = { 
            name: `Stock ${i}`, 
            filter: `contrast(1.1) saturate(0.8) sepia(0.2) brightness(1.1)` 
        };
    }

    return effects;
};

// --- GENERATING 50+ MOVEMENTS ---
const generateMassiveMovements = () => {
    const moves = {};

    // 1. Cinematic Pans (10)
    moves['Cinematic Pans'] = {
        'mov-pan-slow-l': { name: 'Pan Slow Left', type: 'animation' },
        'mov-pan-slow-r': { name: 'Pan Slow Right', type: 'animation' },
        'mov-pan-slow-u': { name: 'Pan Slow Up', type: 'animation' },
        'mov-pan-slow-d': { name: 'Pan Slow Down', type: 'animation' },
        'mov-pan-fast-l': { name: 'Pan Fast Left', type: 'animation' },
        'mov-pan-fast-r': { name: 'Pan Fast Right', type: 'animation' },
        'mov-pan-diag-tl': { name: 'Pan Diag TL', type: 'animation' },
        'mov-pan-diag-tr': { name: 'Pan Diag TR', type: 'animation' },
        'mov-pan-diag-bl': { name: 'Pan Diag BL', type: 'animation' },
        'mov-pan-diag-br': { name: 'Pan Diag BR', type: 'animation' },
    };

    // 2. Dynamic Zooms (10)
    moves['Dynamic Zooms'] = {
        'mov-zoom-crash-in': { name: 'Crash Zoom In', type: 'animation' },
        'mov-zoom-crash-out': { name: 'Crash Zoom Out', type: 'animation' },
        'mov-zoom-twist-in': { name: 'Twist Zoom In', type: 'animation' },
        'mov-zoom-twist-out': { name: 'Twist Zoom Out', type: 'animation' },
        'mov-zoom-bounce-in': { name: 'Bounce Zoom In', type: 'animation' },
        'mov-zoom-pulse-slow': { name: 'Pulse Slow', type: 'animation' },
        'mov-zoom-pulse-fast': { name: 'Pulse Fast', type: 'animation' },
        'mov-zoom-wobble': { name: 'Zoom Wobble', type: 'animation' },
        'mov-zoom-shake': { name: 'Zoom Shake', type: 'animation' },
        'mov-dolly-vertigo': { name: 'Dolly Vertigo', type: 'animation' },
    };

    // 3. 3D Transforms (10)
    moves['3D Transforms'] = {
        'mov-3d-flip-x': { name: 'Flip X 360', type: 'animation' },
        'mov-3d-flip-y': { name: 'Flip Y 360', type: 'animation' },
        'mov-3d-tumble': { name: 'Tumble', type: 'animation' },
        'mov-3d-roll': { name: 'Barrel Roll', type: 'animation' },
        'mov-3d-spin-axis': { name: 'Spin Axis', type: 'animation' },
        'mov-3d-swing-l': { name: 'Swing Left', type: 'animation' },
        'mov-3d-swing-r': { name: 'Swing Right', type: 'animation' },
        'mov-3d-perspective-u': { name: 'Tilt Back', type: 'animation' },
        'mov-3d-perspective-d': { name: 'Tilt Front', type: 'animation' },
        'mov-3d-float': { name: '3D Float', type: 'animation' },
    };

    // 4. Glitch & Chaos (10)
    moves['Glitch & Chaos'] = {
        'mov-glitch-snap': { name: 'Glitch Snap', type: 'animation' },
        'mov-glitch-skid': { name: 'Skid', type: 'animation' },
        'mov-shake-violent': { name: 'Violent Shake', type: 'animation' },
        'mov-jitter-x': { name: 'Jitter X', type: 'animation' },
        'mov-jitter-y': { name: 'Jitter Y', type: 'animation' },
        'mov-rgb-shift-move': { name: 'RGB Shift Move', type: 'animation' },
        'mov-strobe-move': { name: 'Strobe Move', type: 'animation' },
        'mov-digital-tear': { name: 'Digital Tear', type: 'animation' },
        'mov-frame-skip': { name: 'Frame Skip', type: 'animation' },
        'mov-vhs-tracking': { name: 'VHS Tracking', type: 'animation' },
    };

    // 5. Elastic & Bounce (12)
    moves['Elastic & Fun'] = {
        'mov-bounce-drop': { name: 'Bounce Drop', type: 'animation' },
        'mov-elastic-snap-l': { name: 'Elastic Left', type: 'animation' },
        'mov-elastic-snap-r': { name: 'Elastic Right', type: 'animation' },
        'mov-rubber-band': { name: 'Rubber Band', type: 'animation' },
        'mov-jelly-wobble': { name: 'Jelly', type: 'animation' },
        'mov-spring-up': { name: 'Spring Up', type: 'animation' },
        'mov-spring-down': { name: 'Spring Down', type: 'animation' },
        'mov-pendulum-swing': { name: 'Pendulum', type: 'animation' },
        'mov-pop-up': { name: 'Pop Up', type: 'animation' },
        'mov-squash-stretch': { name: 'Squash & Stretch', type: 'animation' },
        'mov-tada': { name: 'Tada!', type: 'animation' },
        'mov-flash-pulse': { name: 'Flash Pulse', type: 'animation' },
    };

    return moves;
};

// MASSIVE FONT LIST FROM INDEX.HTML (Categorized - 200+)
const generateMassiveFonts = () => {
    // Helper to format
    const f = (name, family = name, type = 'sans') => ({ [name.toLowerCase().replace(/\s/g,'')]: { name, class: `font-['${family}']` } });
    
    return {
        'Destaque / Impacto': {
            ...f('Abril Fatface'), ...f('Alfa Slab One'), ...f('Anton'), ...f('Bangers'), ...f('Barrio'),
            ...f('Bebas Neue'), ...f('Black Ops One'), ...f('Bungee'), ...f('Carter One'), ...f('Bowlby One SC'),
            ...f('Chewy'), ...f('Chicle'), ...f('Creepster'), ...f('Faster One'), ...f('Bungee Inline'),
            ...f('Fjalla One'), ...f('Fredoka One'), ...f('Fugaz One'), ...f('Lilita One'), ...f('Bungee Shade'),
            ...f('Luckiest Guy'), ...f('Monoton'), ...f('Passion One'), ...f('Paytone One'), ...f('Black Han Sans'),
            ...f('Permanent Marker'), ...f('Press Start 2P'), ...f('Racing Sans One'), ...f('Allerta Stencil'),
            ...f('Righteous'), ...f('Russo One'), ...f('Shrikhand'), ...f('Sigmar One'), ...f('Archivo Black'),
            ...f('Squada One'), ...f('Staatliches'), ...f('Titan One'), ...f('Ultra'), ...f('Francois One'),
            ...f('Unica One'), ...f('Vampiro One'), ...f('Wallpoet'), ...f('Yeseva One'), ...f('Audiowide'),
            ...f('Rammetto One'), ...f('Ranchers'), ...f('Rowdies'), ...f('Rubik Mono One'), ...f('Seymour One'),
            ...f('Shojumaru'), ...f('Skranji'), ...f('Slackey'), ...f('Smokum'), ...f('Smythe'),
            ...f('Sniglet'), ...f('Snowburst One'), ...f('Special Elite'), ...f('Spicy Rice'), ...f('Stalinist One'),
            ...f('Stardos Stencil'), ...f('Supermercado One'), ...f('Trade Winds'), ...f('UnifrakturCook'),
            ...f('UnifrakturMaguntia'), ...f('VT323'), ...f('Vast Shadow'), ...f('Voces'), ...f('Voltaire')
        },
        'Manuscrito / Script': {
            ...f('Allura'), ...f('Amatic SC'), ...f('Bad Script'), ...f('Berkshire Swash'), ...f('Annie Use Your Telescope'),
            ...f('Caveat'), ...f('Caveat Brush'), ...f('Cookie'), ...f('Courgette'), ...f('Architects Daughter'),
            ...f('Covered By Your Grace'), ...f('Damion'), ...f('Dancing Script'), ...f('Delius'), ...f('Bilbo'),
            ...f('Gloria Hallelujah'), ...f('Gochi Hand'), ...f('Great Vibes'), ...f('Handlee'), ...f('Bonbon'),
            ...f('Indie Flower'), ...f('Italianno'), ...f('Leckerli One'), ...f('Cedarville Cursive'),
            ...f('Marck Script'), ...f('Merienda'), ...f('Mr Dafoe'), ...f('Niconne'), ...f('Coming Soon'),
            ...f('Pacifico'), ...f('Parisienne'), ...f('Patrick Hand'), ...f('Pinyon Script'), ...f('Delius Swash Caps'),
            ...f('Rock Salt'), ...f('Sacramento'), ...f('Satisfy'), ...f('Shadows Into Light'), ...f('Dr Sugiyama'),
            ...f('Tangerine'), ...f('Yellowtail'), ...f('Zeyada'), ...f('Ephesis'), ...f('Finger Paint'),
            ...f('Give You Glory'), ...f('Grand Hotel'), ...f('Griffy'), ...f('Herr Von Muellerhoff'),
            ...f('Homemade Apple'), ...f('Jim Nightshade'), ...f('Jolly Lodger'), ...f('Just Another Hand'),
            ...f('Just Me Again Down Here'), ...f('Kalam'), ...f('Kristi'), ...f('La Belle Aurore'), ...f('League Script'),
            ...f('Long Cang'), ...f('Loved by the King'), ...f('Lovers Quarrel'), ...f('Meddon'), ...f('Meie Script'),
            ...f('Miss Fajardose'), ...f('Molle'), ...f('Monsieur La Doulaise'), ...f('Montez'), ...f('Moon Dance'),
            ...f('Mr Bedfort'), ...f('Mr De Haviland'), ...f('Mrs Saint Delafield'), ...f('Mrs Sheppards'), ...f('Nanum Brush Script'),
            ...f('Nanum Pen Script'), ...f('Neucha'), ...f('Nothing You Could Do'), ...f('Over the Rainbow'), ...f('Patrick Hand SC'),
            ...f('Petit Formal Script'), ...f('Princess Sofia'), ...f('Quintessential'), ...f('Qwigley'), ...f('Rancho'),
            ...f('Reenie Beanie'), ...f('Rochester'), ...f('Rouge Script'), ...f('Ruge Boogie'), ...f('Ruthie'),
            ...f('Seaweed Script'), ...f('Sevillana'), ...f('Shadows Into Light Two'), ...f('Short Stack'), ...f('Sofia'),
            ...f('Stalemate'), ...f('Style Script'), ...f('Sue Ellen Francisco'), ...f('Sunshiney'), ...f('Swanky and Moo Moo'),
            ...f('The Girl Next Door'), ...f('Vibur'), ...f('Waiting for the Sunrise'), ...f('Walter Turncoat'), ...f('Yesteryear')
        },
        'Serifa / Elegante': {
            ...f('Aboreto'), ...f('Amiri'), ...f('Arvo'), ...f('Bitter'), ...f('Alice'),
            ...f('Bodoni Moda'), ...f('Bree Serif'), ...f('Cinzel'), ...f('Cormorant Garamond'), ...f('Amita'),
            ...f('Crimson Text'), ...f('DM Serif Display'), ...f('Domine'), ...f('EB Garamond'), ...f('Antic Didone'),
            ...f('Faustina'), ...f('Frank Ruhl Libre'), ...f('Glegoo'), ...f('Goudy Bookletter 1911'), ...f('Arapey'),
            ...f('IBM Plex Serif'), ...f('Josefin Slab'), ...f('Libre Baskerville'), ...f('Lora'), ...f('Artifika'),
            ...f('Markazi Text'), ...f('Mate'), ...f('Merriweather'), ...f('Montaga'), ...f('Average'),
            ...f('Noto Serif'), ...f('Old Standard TT'), ...f('Playfair Display'), ...f('Podkova'), ...f('Baza'),
            ...f('Prata'), ...f('PT Serif'), ...f('Quattrocento'), ...f('Roboto Slab'), ...f('Belgrano'),
            ...f('Rokkitt'), ...f('Rozha One'), ...f('Rufina'), ...f('Sanchez'), ...f('Bellefair'),
            ...f('Spectral'), ...f('Sura'), ...f('Tienne'), ...f('Tinos'), ...f('Trirong'), ...f('Bentham'),
            ...f('Ultra'), ...f('Vidaloka'), ...f('Vollkorn'), ...f('Zilla Slab'), ...f('BioRhyme'),
            ...f('Bookmate'), ...f('Calistoga'), ...f('Cambay'), ...f('Cambo'), ...f('Cantata One'),
            ...f('Cardo'), ...f('Castoro'), ...f('Caudex'), ...f('Cherry Swash'), ...f('Chonburi'),
            ...f('Cinzel Decorative'), ...f('Copse'), ...f('Cormorant'), ...f('Cormorant Infant'), ...f('Cormorant SC'),
            ...f('Cormorant Unicase'), ...f('Cormorant Upright'), ...f('Coustard'), ...f('Crete Round'), ...f('Cutive'),
            ...f('David Libre'), ...f('Della Respira'), ...f('Donegal One'), ...f('Elsie'), ...f('Elsie Swash Caps'),
            ...f('Emblema One'), ...f('Enriqueta'), ...f('Esteban'), ...f('Fanwood Text'), ...f('Fenix'),
            ...f('Fjord One'), ...f('Forum'), ...f('Gabriela'), ...f('Galdeano'), ...f('Gentium Basic'),
            ...f('Gentium Book Basic'), ...f('Geo'), ...f('Gilda Display'), ...f('Glass Antiqua'), ...f('Gledger'),
            ...f('Goblin One'), ...f('Goudy Bookletter 1911'), ...f('Gravitas One'), ...f('Grenze'), ...f('Grenze Gotisch'),
            ...f('Habibi'), ...f('Halant'), ...f('Headland One'), ...f('Hepta Slab'), ...f('Holtwood One SC'),
            ...f('IM Fell DW Pica'), ...f('IM Fell DW Pica SC'), ...f('IM Fell Double Pica'), ...f('IM Fell Double Pica SC'), ...f('IM Fell English'),
            ...f('IM Fell English SC'), ...f('IM Fell French Canon'), ...f('IM Fell French Canon SC'), ...f('IM Fell Great Primer'), ...f('IM Fell Great Primer SC'),
            ...f('Ibarra Real Nova'), ...f('Imbue'), ...f('Inknut Antiqua'), ...f('Inria Serif'), ...f('Italiana'),
            ...f('Jacques Francois'), ...f('Jacques Francois Shadow'), ...f('Judson'), ...f('Jura'), ...f('Kadwa'),
            ...f('Kameron'), ...f('Kelly Slab'), ...f('Kotta One'), ...f('Koulen'), ...f('Kreon'),
            ...f('Kurale'), ...f('Laila'), ...f('Lancelot'), ...f('Ledger'), ...f('Libre Caslon Display'),
            ...f('Libre Caslon Text'), ...f('Life Savers'), ...f('Lilita One'), ...f('Lily Script One'), ...f('Limelight'),
            ...f('Linden Hill'), ...f('Literata'), ...f('Lustria'), ...f('Macondo'), ...f('Macondo Swash Caps'),
            ...f('Mada'), ...f('Maiden Orange'), ...f('Maitree'), ...f('Marcellus'), ...f('Marcellus SC'),
            ...f('Marvel'), ...f('Mate SC'), ...f('MedievalSharp'), ...f('Medula One'), ...f('Meera Inimai'),
            ...f('Megrim'), ...f('Metal Mania'), ...f('Metamorphous'), ...f('Metrophobic'), ...f('Michroma'),
            ...f('Milonga'), ...f('Miltonian'), ...f('Miltonian Tattoo'), ...f('Miniver'), ...f('Mirza'),
            ...f('Modern Antiqua'), ...f('Molengo'), ...f('Monda'), ...f('Montaga'), ...f('Mrs Saint Delafield'),
            ...f('Mukta Mahee'), ...f('Mukta Malar'), ...f('Mukta Vaani'), ...f('Murecho'), ...f('MuseoModerno'),
            ...f('Mystery Quest'), ...f('NTR'), ...f('Nanum Myeongjo'), ...f('Neuton'), ...f('New Rocker'),
            ...f('News Cycle'), ...f('Niramit'), ...f('Nixie One'), ...f('Nobile'), ...f('Nokora'),
            ...f('Norican'), ...f('Nosifer'), ...f('Noticia Text'), ...f('Noto Serif Display'), ...f('Nova Cut'),
            ...f('Nova Flat'), ...f('Nova Mono'), ...f('Nova Oval'), ...f('Nova Round'), ...f('Nova Script'),
            ...f('Nova Slim'), ...f('Nova Square'), ...f('Numans'), ...f('Nunito'), ...f('Odor Mean Chey'),
            ...f('Offside'), ...f('Old Standard TT'), ...f('Oldenburg'), ...f('Oleo Script'), ...f('Oleo Script Swash Caps'),
            ...f('Oranienbaum'), ...f('Oregano'), ...f('Orienta'), ...f('Original Surfer'), ...f('Overlock'),
            ...f('Overlock SC'), ...f('Ovo'), ...f('Oxanium'), ...f('Oxygen Mono'), ...f('PT Mono'),
            ...f('PT Sans Caption'), ...f('PT Sans Narrow'), ...f('PT Serif Caption'), ...f('Padauk'), ...f('Palanquin'),
            ...f('Palanquin Dark'), ...f('Pangolin'), ...f('Paprika'), ...f('Passero One'), ...f('Pathway Gothic One'),
            ...f('Pattaya'), ...f('Patua One'), ...f('Pavanam'), ...f('Peddana'), ...f('Peralta'),
            ...f('Petrona'), ...f('Philosopher'), ...f('Piedra'), ...f('Pirata One'), ...f('Plaster'),
            ...f('Play'), ...f('Playball'), ...f('Playfair Display SC'), ...f('Poiret One'), ...f('Poller One'),
            ...f('Poly'), ...f('Pompiere'), ...f('Pontano Sans'), ...f('Poor Story'), ...f('Port Lligat Sans'),
            ...f('Port Lligat Slab'), ...f('Pragati Narrow'), ...f('Pridi'), ...f('Prociono'), ...f('Prompt'),
            ...f('Prosto One'), ...f('Proza Libre'), ...f('Puritan'), ...f('Purple Purse'), ...f('Quando'),
            ...f('Quantico'), ...f('Quattrocento Sans'), ...f('Questrial'), ...f('Radley'), ...f('Rakkas'),
            ...f('Raleway Dots'), ...f('Ramabhadra'), ...f('Ramaraja'), ...f('Rambla'), ...f('Ranga'),
            ...f('Rasa'), ...f('Rationale'), ...f('Ravi Prakash'), ...f('Redressed'), ...f('Reem Kufi'),
            ...f('Revalia'), ...f('Rhodium Libre'), ...f('Ribeye'), ...f('Ribeye Marrow'), ...f('Risque'),
            ...f('Road Rage'), ...f('Roboto Condensed'), ...f('Roboto Mono'), ...f('Romanesco'), ...f('Ropa Sans'),
            ...f('Rosario'), ...f('Rosarivo'), ...f('Rubik Burned'), ...f('Rubik Distressed'), ...f('Rubik Glitch'),
            ...f('Rubik Iso'), ...f('Rubik Marker Hatch'), ...f('Rubik Maze'), ...f('Rubik Microbe'), ...f('Rubik Moonrocks'),
            ...f('Rubik Puddles'), ...f('Rubik Wet Paint'), ...f('Ruda'), ...f('Rum Raisin'), ...f('Ruslan Display'),
            ...f('Rye'), ...f('Sahitya'), ...f('Sail'), ...f('Saira Condensed'), ...f('Saira Extra Condensed'),
            ...f('Saira Semi Condensed'), ...f('Saira Stencil One'), ...f('Salsa'), ...f('Sancreek'), ...f('Sansita'),
            ...f('Sarala'), ...f('Sarina'), ...f('Sarpanch'), ...f('Sawarabi Gothic'), ...f('Sawarabi Mincho'),
            ...f('Scada'), ...f('Scheherazade New'), ...f('Schoolbell'), ...f('Scope One'), ...f('Secular One'),
            ...f('Sedgwick Ave'), ...f('Sedgwick Ave Display'), ...f('Shadows Into Light'), ...f('Shanti'), ...f('Share'),
            ...f('Share Tech'), ...f('Share Tech Mono'), ...f('Siemreap'), ...f('Signika Negative'), ...f('Simonetta'),
            ...f('Single Day'), ...f('Sintony'), ...f('Sirin Stencil'), ...f('Six Caps'), ...f('Slabo 13px'),
            ...f('Slabo 27px'), ...f('Sofadi One'), ...f('Solway'), ...f('Song Myung'), ...f('Sonsie One'),
            ...f('Sorts Mill Goudy'), ...f('Source Code Pro'), ...f('Source Serif Pro'), ...f('Space Mono'), ...f('Spectral SC'),
            ...f('Spicy Rice'), ...f('Spinnaker'), ...f('Spirax'), ...f('Sree Krushnadevaraya'), ...f('Sriracha'),
            ...f('Stint Ultra Condensed'), ...f('Stint Ultra Expanded'), ...f('Stoke'), ...f('Strait'), ...f('Stylish'),
            ...f('Suez One'), ...f('Sulphur Point'), ...f('Sumana'), ...f('Sunflower'), ...f('Suranna'),
            ...f('Suravaram'), ...f('Suwannaphum'), ...f('Syncopate'), ...f('Syne Mono'), ...f('Syne Tactile'),
            ...f('Tajawal'), ...f('Taprom'), ...f('Tauri'), ...f('Taviraj'), ...f('Teko'),
            ...f('Telex'), ...f('Tenali Ramakrishna'), ...f('Tenor Sans'), ...f('Text Me One'), ...f('Thasadith'),
            ...f('Tillana'), ...f('Timmana'), ...f('Titillium Web'), ...f('Tomorrow'), ...f('Trirong'),
            ...f('Trocchi'), ...f('Trochut'), ...f('Trykker'), ...f('Tulpen One'), ...f('Turret Road'),
            ...f('Ubuntu Condensed'), ...f('Ubuntu Mono'), ...f('Uncial Antiqua'), ...f('Underdog'), ...f('Unlock'),
            ...f('Unna'), ...f('Varela'), ...f('Vesper Libre'), ...f('Viaoda Libre'), ...f('Vibes'),
            ...f('Viga'), ...f('Volkhov'), ...f('Vollkorn SC'), ...f('Warnes'), ...f('Wellfleet'),
            ...f('Wendy One'), ...f('Wire One'), ...f('Xanh Mono'), ...f('Yanone Kaffeesatz'), ...f('Yatra One'),
            ...f('Yeon Sung'), ...f('Yrsa'), ...f('ZCOOL KuaiLe'), ...f('ZCOOL QingKe HuangYou'), ...f('ZCOOL XiaoWei'),
            ...f('Zen Dots'), ...f('Zen Kaku Gothic Antique'), ...f('Zen Kaku Gothic New'), ...f('Zen Loop'), ...f('Zen Maru Gothic'),
            ...f('Zen Old Mincho'), ...f('Zhi Mang Xing'), ...f('Zilla Slab Highlight')
        },
        'Sans-Serif / Moderno': {
            ...f('Acme'), ...f('Alata'), ...f('Archivo'), ...f('Assistant'), ...f('Barlow'),
            ...f('Cabin'), ...f('Catamaran'), ...f('Chakra Petch'), ...f('Comfortaa'), ...f('Abel'),
            ...f('Didact Gothic'), ...f('Dosis'), ...f('Exo 2'), ...f('Fira Sans'), ...f('Advent Pro'),
            ...f('Heebo'), ...f('Hind'), ...f('IBM Plex Sans'), ...f('Inconsolata'), ...f('Alef'),
            ...f('Inter'), ...f('Josefin Sans'), ...f('Jost'), ...f('Kanit'), ...f('Lato'),
            ...f('League Spartan'), ...f('Lexend'), ...f('Libre Franklin'), ...f('Manrope'), ...f('Alegreya Sans'),
            ...f('Maven Pro'), ...f('Montserrat'), ...f('Mukta'), ...f('Nanum Gothic'), ...f('Alegreya Sans SC'),
            ...f('Noto Sans'), ...f('Nunito'), ...f('Open Sans'), ...f('Outfit'), ...f('Amaranth'),
            ...f('Overpass'), ...f('Oxygen'), ...f('Poppins'), ...f('Prompt'), ...f('Amiko'),
            ...f('Public Sans'), ...f('Quicksand'), ...f('Rajdhani'), ...f('Raleway'), ...f('Anaheim'),
            ...f('Roboto'), ...f('Rubik'), ...f('Saira'), ...f('Signika'), ...f('Andika'),
            ...f('Source Sans Pro'), ...f('Space Grotesk'), ...f('Teko'), ...f('Titillium Web'), ...f('Antic'),
            ...f('Ubuntu'), ...f('Varela Round'), ...f('Work Sans'), ...f('Yantramanav'), ...f('Antonio')
        },
        'Temático / Divertido': {
            ...f('Aladin'), ...f('Amita'), ...f('Annie Use Your Telescope'), ...f('Architects Daughter'),
            ...f('Asset'), ...f('Atomic Age'), ...f('Audiowide'), ...f('Barrio'),
            ...f('Black And White Picture'), ...f('Boogaloo'), ...f('Butcherman'), ...f('Cabin Sketch'),
            ...f('Caesar Dressing'), ...f('Codystar'), ...f('Coming Soon'), ...f('Contrail One'),
            ...f('Creepster'), ...f('Diplomata SC'), ...f('Eater'), ...f('Emilys Candy'),
            ...f('Ewert'), ...f('Fascinate'), ...f('Finger Paint'), ...f('Flavors'),
            ...f('Fontdiner Swanky'), ...f('Freckle Face'), ...f('Frijole'), ...f('Gamja Flower'),
            ...f('Germania One'), ...f('Glass Antiqua'), ...f('Goblin One'), ...f('Griffy'),
            ...f('Henny Penny'), ...f('Homemade Apple'), ...f('Iceberg'), ...f('Irish Grover'),
            ...f('Jolly Lodger'), ...f('Kavoon'), ...f('Keania One'), ...f('Kranky'),
            ...f('Kumar One'), ...f('Lobster'), ...f('Lobster Two'), ...f('Londrina Sketch'),
            ...f('Love Ya Like A Sister'), ...f('Macondo'), ...f('Maiden Orange'), ...f('MedievalSharp'),
            ...f('Metal Mania'), ...f('Miltonian'), ...f('Mystery Quest'), ...f('New Rocker'),
            ...f('Nosifer'), ...f('Nova Cut'), ...f('Orbitron'), ...f('Oregano'),
            ...f('Piedra'), ...f('Pirata One'), ...f('Plaster'), ...f('Ranchers'),
            ...f('Ribeye'), ...f('Risque'), ...f('Rye'), ...f('Sancreek'),
            ...f('Shojumaru'), ...f('Slackey'), ...f('Smokum'), ...f('Snowburst One'),
            ...f('Special Elite'), ...f('Spicy Rice'), ...f('Stalemate'), ...f('Trade Winds'),
            ...f('UnifrakturMaguntia'), ...f('VT323'), ...f('Walter Turncoat'), ...f('Yeon Sung')
        }
    };
};

// MERGE EVERYTHING
const generatedEffects = generateMassiveEffects();
const generatedMovements = generateMassiveMovements();
const massiveFonts = generateMassiveFonts();

export const TEXT_RESOURCES = {
    templates: generateTextTemplates(),
    effects: generateTextEffects(),
    animations: generateTextAnimations()
};

export const RESOURCES = {
    previewImage: 'https://images.pexels.com/photos/2873277/pexels-photo-2873277.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
    previewImages: {
        'Cinematic Pro (20+)': 'https://images.pexels.com/photos/2873277/pexels-photo-2873277.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
        'Estilos Artísticos': 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
        'Tendência': 'https://images.pexels.com/photos/1036623/pexels-photo-1036623.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
        'Filtros Básicos': 'https://images.pexels.com/photos/1036623/pexels-photo-1036623.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
        'Color Grade (50+)': 'https://images.pexels.com/photos/2873277/pexels-photo-2873277.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
        'Vintage & Retro (30+)': 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
        'Cinematic': 'https://images.pexels.com/photos/2873277/pexels-photo-2873277.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
        'Artístico': 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260',
        'Vlog / Social': 'https://images.pexels.com/photos/1036623/pexels-photo-1036623.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260'
    },
    textStyles: massiveFonts, // REPLACED WITH MASSIVE FONT LIST
    ttsVoices: { 'virtual': generateVoiceVariations() },
    ttsStyles: [ 
        { id: 'normal', name: 'Normal / Neutro' }, 
        { id: 'dramatic', name: 'Dramático / Storytelling' },
        { id: 'informative', name: 'Informativo / Tutorial' },
        { id: 'motivational', name: 'Motivacional / Inspirador' },
        { id: 'humorous', name: 'Humorado / Irônico' },
        { id: 'poetic', name: '📜 Poético / Lírico' },
        { id: 'news', name: '📰 Jornalístico / Notícias' },
        { id: 'commercial', name: '🛒 Comercial / Vendas' },
        { id: 'trailer', name: '🎬 Trailer Épico' }
    ],
    ttsEmotions: [
        { id: 'neutral', name: '😐 Neutro' },
        { id: 'happy', name: '😊 Feliz / Alegre' },
        { id: 'excited', name: '🤩 Empolgado / Eufórico' },
        { id: 'sad', name: '😢 Triste / Melancólico' },
        { id: 'angry', name: '😠 Bravo / Furioso' },
        { id: 'scared', name: '😨 Assustado / Medo' },
        { id: 'whisper', name: '🤫 Sussurrando / Segredo' },
        { id: 'shout', name: '🗣️ Gritando / Alto' },
        { id: 'deep', name: '🕳️ Profundo / Obscuro' },
        { id: 'high_pitch', name: '🐭 Agudo / Tímido' },
        { id: 'anxious', name: '😰 Ansioso / Nervoso' },
        { id: 'sarcastic', name: '😏 Sarcástico / Irônico' },
        { id: 'romantic', name: '😍 Romântico / Apaixonado' }
    ],
    ttsAccents: [
        { id: 'none', name: '🌍 Sem Sotaque' },
        { id: 'dragged', name: '🇧🇷 Arrastado / Voz Lenta' },
        { id: 'rural', name: '🇧🇷 Caipira / Interior' },
        { id: 'northeast', name: '🇧🇷 Nordestino' },
        { id: 'carioca', name: '🇧🇷 Carioca' },
        { id: 'gaúcho', name: '🇧🇷 Gaúcho' },
        { id: 'mineiro', name: '🇧🇷 Mineiro' },
        { id: 'angola', name: '🇦🇴 Português Angolano' },
        { id: 'portugal', name: '🇵🇹 Português de Portugal' },
        { id: 'en-south', name: '🇺🇸 Inglês Sulista (Texas)' },
        { id: 'en-ny', name: '🇺🇸 Inglês Nova Iorque' },
        { id: 'british', name: '🇬🇧 Inglês Britânico Posh' },
        { id: 'cockney', name: '🇬🇧 Inglês Britânico Cockney' },
        { id: 'american', name: '🇺🇸 Inglês Americano Flat' },
        { id: 'en-au', name: '🇦🇺 Inglês Australiano' },
        { id: 'fr-paris', name: '🇫🇷 Francês Parisiense' },
        { id: 'french-acc', name: '🇫🇷 Francês Melódico' },
        { id: 'it-roma', name: '🇮🇹 Italiano Romano' },
        { id: 'italian-acc', name: '🇮🇹 Italiano Expressive' },
        { id: 'es-es', name: '🇪🇸 Espanhol Castellano' },
        { id: 'es-mx', name: '🇲🇽 Espanhol Mexicano' },
        { id: 'es-ar', name: '🇦🇷 Espanhol Argentino' },
        { id: 'jp-tokyo', name: '🇯🇵 Japonês Padrão' },
        { id: 'jp-kansai', name: '🇯🇵 Japonês Kansai' }
    ],
    ttsNuances: [
        { id: 'none', name: '🔇 Sem Nuances' },
        { id: 'breath', name: '🫁 Respirações' },
        { id: 'cough', name: '🗣️ Tosses Leves' },
        { id: 'throat', name: '🧼 Limpar Garganta' },
        { id: 'chuckle', name: '🤭 Risada Leve' },
        { id: 'sigh', name: '💨 Suspiros' },
        { id: 'hesitate', name: '🤔 Hesitações (Hum...)' },
        { id: 'smack', name: '👅 Estalar de Língua' },
        { id: 'mutter', name: '💬 Murmúrios' },
        { id: 'panting', name: '🏃 Ofegante' },
        { id: 'stutter', name: '🧱 Gagueira Leve' }
    ],
    ttsModels: [
        { id: 'human-vlog', name: 'Vlog Ultra-Realista', config: { style: 'casual', accent: 'none', emotion: 'happy', nuance: 'breath' } },
        { id: 'story-dark', name: 'Conto Sombrio', config: { style: 'scary', accent: 'none', emotion: 'sad', nuance: 'sigh' } },
        { id: 'tutorial-pro', name: 'Tutorial Expert', config: { style: 'informative', accent: 'none', emotion: 'neutral', nuance: 'hesitate' } },
        { id: 'epic-narrator', name: 'Narrador Épico', config: { style: 'trailer', accent: 'none', emotion: 'excited', nuance: 'breath' } },
        { id: 'asmr-whisper', name: 'ASMR Relax', config: { style: 'asmr', accent: 'none', emotion: 'neutral', nuance: 'smack' } },
        { id: 'tired-old', name: 'Idoso Cansado', config: { style: 'old', accent: 'none', emotion: 'sad', nuance: 'cough' } },
        { id: 'hero-action', name: 'Herói Ofegante', config: { style: 'hero', accent: 'none', emotion: 'excited', nuance: 'panting' } },
        { id: 'anxious-nerd', name: 'Nerd Ansioso', config: { style: 'casual', accent: 'none', emotion: 'anxious', nuance: 'stutter' } },
        { id: 'drunk-casual', name: 'Casual "Altinho"', config: { style: 'dragged', accent: 'none', emotion: 'happy', nuance: 'chuckle' } },
        { id: 'mystery-man', name: 'Mistério Deep', config: { style: 'deep-2', accent: 'none', emotion: 'neutral', nuance: 'mutter' } }
    ],
    // MERGE EXISTING EFFECTS WITH NEW ONES
    effects: {
        'Cinematic Pro (20+)': {
            'teal-orange': { name: 'Teal & Orange', filter: 'contrast(1.2) saturate(1.3) hue-rotate(-10deg) sepia(0.2)' },
            'matrix': { name: 'Matrix', filter: 'contrast(1.2) hue-rotate(90deg) brightness(0.9) saturate(1.5)' },
            'noir': { name: 'Noir Film', filter: 'grayscale(1) contrast(1.5) brightness(0.9)' },
            'vintage-warm': { name: 'Vintage Warm', filter: 'sepia(0.5) contrast(0.9) brightness(1.1) saturate(1.2)' },
            'cool-morning': { name: 'Cool Morning', filter: 'hue-rotate(180deg) sepia(0.2) brightness(1.1)' },
            'cyberpunk': { name: 'Cyberpunk', filter: 'contrast(1.4) saturate(2) hue-rotate(20deg)' },
            'dreamy-blur': { name: 'Dreamy', filter: 'blur(2px) brightness(1.2) saturate(0.8)' },
            'horror': { name: 'Horror', filter: 'grayscale(0.8) contrast(1.5) brightness(0.7) sepia(0.3)' },
            'underwater': { name: 'Underwater', filter: 'hue-rotate(190deg) brightness(0.8) contrast(1.2)' },
            'sunset': { name: 'Sunset', filter: 'sepia(0.6) saturate(1.5) hue-rotate(-20deg)' },
            'posterize': { name: 'Posterize', filter: 'contrast(2.0) saturate(1.5)' },
            'fade': { name: 'Faded', filter: 'contrast(0.8) brightness(1.2) sepia(0.2)' },
            'vibrant': { name: 'Vibrant', filter: 'saturate(2.5) contrast(1.1)' },
            'muted': { name: 'Muted', filter: 'saturate(0.5) contrast(0.9)' },
            'b-and-w-low': { name: 'B&W Low', filter: 'grayscale(1) contrast(0.8)' },
            'golden-hour': { name: 'Golden Hour', filter: 'sepia(0.3) saturate(1.4) brightness(1.1)' },
            'cold-blue': { name: 'Cold Blue', filter: 'hue-rotate(210deg) saturate(0.8)' },
            'night-vision': { name: 'Night Vision', filter: 'grayscale(1) sepia(1) hue-rotate(90deg) contrast(1.5)' },
            'scifi': { name: 'Sci-Fi', filter: 'contrast(1.3) hue-rotate(180deg)' },
            'pastel': { name: 'Pastel', filter: 'brightness(1.2) saturate(0.7) contrast(0.9)' }
        },
        'Estilos Artísticos': {
            'pop-art': { name: 'Pop Art', filter: 'saturate(3) contrast(1.5)' },
            'sketch-sim': { name: 'Sketch Sim', filter: 'grayscale(1) contrast(5) brightness(1.5)' },
            'invert': { name: 'Invert', filter: 'invert(1)' },
            'sepia-max': { name: 'Sepia Max', filter: 'sepia(1)' },
            'high-contrast': { name: 'High Contrast', filter: 'contrast(3)' },
            'low-light': { name: 'Low Light', filter: 'brightness(0.5) contrast(1.5)' },
            'overexposed': { name: 'Overexposed', filter: 'brightness(1.5) contrast(0.8)' },
            'radioactive': { name: 'Radioactive', filter: 'hue-rotate(90deg) saturate(3)' },
            'deep-fried': { name: 'Deep Fried', filter: 'contrast(2) saturate(3) sharpen(2)' },
            'ethereal': { name: 'Ethereal', filter: 'brightness(1.3) contrast(0.8) saturate(0.5)' }
        },
        'Tendência': {
            'dv-cam': { name: 'DV Cam', filter: 'sepia(0.2) contrast(1.1)', overlayClass: 'effect-dv-cam' },
            'bling': { name: 'Bling', filter: 'brightness(1.1)', overlayClass: 'effect-bling' },
            'soft-angel': { name: 'Anjo Suave', filter: 'brightness(1.2) contrast(0.9) blur(0.5px)', overlayClass: 'effect-soft-glow' },
            'sharpen': { name: 'HDR', filter: 'contrast(1.4) saturate(1.2)', overlayClass: 'effect-sharpen' }
        },
        'Filtros Básicos': { 
            'warm': { name: 'Quente', filter: 'sepia(0.4) contrast(1.1) brightness(1.1)' }, 
            'cool': { name: 'Frio', filter: 'contrast(1.1) brightness(1.1) hue-rotate(-15deg)' }, 
            'vivid': { name: 'Vívido', filter: 'saturate(1.8) contrast(1.2)' }, 
            'mono': { name: 'P&B', filter: 'grayscale(1)' }, 
            'vintage': { name: 'Vintage', filter: 'sepia(0.6) contrast(0.9) brightness(1.2)' },
            'dreamy': { name: 'Sonho', filter: 'blur(1px) brightness(1.2) saturate(0.8)' }
        },
        'Glitch & Distorção': { 
            'glitch-pro-1': { name: 'Data Scan', overlayClass: 'effect-glitch-scan' }, 
            'glitch-pro-2': { name: 'Blocky', overlayClass: 'effect-glitch-blocky' }, 
            'vhs-distort': { name: 'VHS', overlayClass: 'effect-vhs' }, 
            'bad-signal': { name: 'TV Ruim', overlayClass: 'effect-bad-signal' }, 
            'chromatic': { name: 'Aberração', overlayClass: 'effect-chromatic' },
            'pixelate': { name: 'Pixelado', overlayClass: 'effect-pixelate' }
        },
        'Retro & Filme': { 
            'old-film': { name: 'Filme Antigo', overlayClass: 'effect-old-film-scratches' }, 
            'dust': { name: 'Poeira', overlayClass: 'effect-dust' },
            'grain': { name: 'Granulação', overlayClass: 'effect-film-grain' },
            'vignette': { name: 'Vinheta', overlayClass: 'effect-vignette-heavy' },
            'super8': { name: 'Super 8', overlayClass: 'effect-super8' },
            'noise': { name: 'Ruído', overlayClass: 'effect-noise' }
        },
        'Atmosfera & Luz': { 
            'light-leak-1': { name: 'Light Leak 1', overlayClass: 'effect-light-leak' }, 
            'light-leak-2': { name: 'Light Leak 2', overlayClass: 'effect-light-leak-2' },
            'sun-flare': { name: 'Flare Solar', overlayClass: 'effect-lens-flare' },
            'god-rays': { name: 'Raios Divinos', overlayClass: 'effect-light-rays' },
            'neon-glow': { name: 'Brilho Neon', overlayClass: 'effect-neon-glow' },
            'strobe': { name: 'Estrobo', overlayClass: 'effect-strobe' }
        },
        'Reativos (Audio & Ritmo)': {
            'react-pulse': { name: 'Pulso Rítmico', overlayClass: 'effect-pulse-reactive' },
            'react-shake': { name: 'Vibração Ativa', overlayClass: 'effect-shake-reactive' },
            'react-glow': { name: 'Brilho Reativo', overlayClass: 'effect-glow-reactive' },
            'react-bass-zoom': { name: 'Zoom Sub-Grave', overlayClass: 'effect-zoom-reactive' },
            'react-edge-flash': { name: 'Bordas Pulsantes', overlayClass: 'effect-edge-reactive' }
        },
        'Inteligência Morpheus (Exclusivo)': {
            'morpheus-glass': { name: 'Vidro Líquido', engine: 'morpheus', style: 'Vidro Líquido' },
            'morpheus-ether': { name: 'Éter Quântico', engine: 'morpheus', style: 'Éter Quântico' },
            'morpheus-neon': { name: 'Cyberpunk Orgânico', engine: 'morpheus', style: 'Cyberpunk Orgânico' }
        },
        ...generatedEffects // Appending 200+ new effects here
    },
    transitions: {
        '🔥 Tendência CapCut': {
            'blood-mist': { name: 'Névoa de Sangue', iconClass: 'trans-blood-mist', icon: 'fa-skull' },
            'black-smoke': { name: 'Fumaça Preta', iconClass: 'trans-black-smoke', icon: 'fa-smog' },
            'white-smoke': { name: 'Fumaça Branca', iconClass: 'trans-white-smoke', icon: 'fa-cloud' },
            'fire-burn': { name: 'Incêndio', iconClass: 'trans-fire-burn', icon: 'fa-fire' },
            'color-glitch': { name: 'Falha de Cores', iconClass: 'trans-color-glitch', icon: 'fa-bug' },
            'urban-glitch': { name: 'Falha Urbana', iconClass: 'trans-urban-glitch', icon: 'fa-city' },
            'visual-buzz': { name: 'Zumbido Visual', iconClass: 'trans-visual-buzz', icon: 'fa-bolt' },
            'rip-diag': { name: 'Rasgo Diagonal', iconClass: 'trans-rip-diag', icon: 'fa-cut' },
            'zoom-neg': { name: 'Zoom Negativo', iconClass: 'trans-zoom-neg', icon: 'fa-search-minus' },
            'infinity-1': { name: 'Infinito 1', iconClass: 'trans-infinity-1', icon: 'fa-infinity' },
            'digital-paint': { name: 'Pintura Digital', iconClass: 'trans-digital-paint', icon: 'fa-paint-brush' },
            'brush-wind': { name: 'Vento Pincel', iconClass: 'trans-brush-wind', icon: 'fa-wind' },
            
            'dust-burst': { name: 'Rajada de Poeira', iconClass: 'trans-dust-burst', icon: 'fa-cloud-meatball' },
            'filter-blur': { name: 'Desfoque de Filtro', iconClass: 'trans-filter-blur', icon: 'fa-eye-slash' },
            'film-roll-v': { name: 'Rolo de Filme', iconClass: 'trans-film-roll-v', icon: 'fa-film' },
            'astral-project': { name: 'Projeto Astral', iconClass: 'trans-astral', icon: 'fa-ghost' },
            'lens-flare': { name: 'Brilho de Lente', iconClass: 'trans-lens-flare', icon: 'fa-sun' },
            'pull-away': { name: 'Afastar', iconClass: 'trans-pull-away', icon: 'fa-search-minus' },
            'fade-classic': { name: 'Desvanecimento', iconClass: 'trans-fade-classic', icon: 'fa-circle-notch' },
            'flash-black': { name: 'Flash Preto', iconClass: 'trans-flash-black', icon: 'fa-bolt' },
            'flash-white': { name: 'Flash', iconClass: 'trans-flash', icon: 'fa-bolt' },
            'flashback': { name: 'Flashback', iconClass: 'trans-flashback', icon: 'fa-history' },
            'combine-overlay': { name: 'Sobrepor', iconClass: 'trans-combine-overlay', icon: 'fa-layer-group' },
            'combine-mix': { name: 'Combinar', iconClass: 'trans-combine-mix', icon: 'fa-object-group' },
            'nightmare': { name: 'Pesadelo', iconClass: 'trans-nightmare', icon: 'fa-spider' },
            'bubble-blur': { name: 'Bubble Blur', iconClass: 'trans-bubble-blur', icon: 'fa-soap' },
            'paper-unfold': { name: 'Papel Desdobrando', iconClass: 'trans-paper-unfold', icon: 'fa-book-open' },
            'corrupt-img': { name: 'Img Corrompendo', iconClass: 'trans-corrupt', icon: 'fa-file-excel' },
            'glow-intense': { name: 'Brilho 2', iconClass: 'trans-glow-intense', icon: 'fa-sun' },
            'dynamic-blur': { name: 'Borrão Dinâmico', iconClass: 'trans-dynamic-blur', icon: 'fa-wind' },
            'blur-dissolve': { name: 'Desfocar', iconClass: 'trans-blur-dissolve', icon: 'fa-eye-slash' },
            'glitch-chroma': { name: 'Glitch Chroma', iconClass: 'trans-glitch-chroma', icon: 'fa-tv' }
        },
        'Geométrica (15+)': {
            'wipe-up': { name: 'Wipe Up', iconClass: 'trans-wipe-up', icon: 'fa-arrow-up' },
            'wipe-down': { name: 'Wipe Down', iconClass: 'trans-wipe-down', icon: 'fa-arrow-down' },
            'circle-open': { name: 'Circle Open', iconClass: 'trans-circle-open', icon: 'fa-circle-notch' },
            'circle-close': { name: 'Circle Close', iconClass: 'trans-circle-close', icon: 'fa-circle' },
            'diamond-in': { name: 'Diamond In', iconClass: 'trans-diamond-in', icon: 'fa-gem' },
            'diamond-out': { name: 'Diamond Out', iconClass: 'trans-diamond-out', icon: 'fa-gem' },
            'clock-wipe': { name: 'Clock', iconClass: 'trans-clock-wipe', icon: 'fa-clock' },
            'plus-wipe': { name: 'Plus', iconClass: 'trans-plus-wipe', icon: 'fa-plus' },
            'checker-wipe': { name: 'Checker', iconClass: 'trans-checker-wipe', icon: 'fa-chess-board' },
            'blind-h': { name: 'Blinds H', iconClass: 'trans-blind-h', icon: 'fa-bars' },
            'blind-v': { name: 'Blinds V', iconClass: 'trans-blind-v', icon: 'fa-grip-lines-vertical' },
            'barn-door-h': { name: 'Barn Door H', iconClass: 'trans-barn-h', icon: 'fa-door-open' },
            'barn-door-v': { name: 'Barn Door V', iconClass: 'trans-barn-v', icon: 'fa-door-open' },
            'iris-in': { name: 'Iris In', iconClass: 'trans-iris-in', icon: 'fa-dot-circle' },
            'iris-out': { name: 'Iris Out', iconClass: 'trans-iris-out', icon: 'fa-dot-circle' }
        },
        'Básico': { 
            'crossfade': { name: 'Dissolver', iconClass: 'trans-crossfade', icon: 'fa-circle-half-stroke' }, 
            'black': { name: 'Para Preto', iconClass: 'trans-black', icon: 'fa-square' }, 
            'white': { name: 'Para Branco', iconClass: 'trans-white', icon: 'fa-square' }, 
            'mix': { name: 'Mix', iconClass: 'trans-mix', icon: 'fa-random' }
        },
        'Glitch Pro & Cyber': {
            'pixel-sort': { name: 'Pixel Sort', iconClass: 'trans-pixel-sort', icon: 'fa-align-justify' },
            'rgb-shake': { name: 'RGB Shake', iconClass: 'trans-rgb-shake', icon: 'fa-tv' },
            'hologram': { name: 'Holograma', iconClass: 'trans-hologram', icon: 'fa-wifi' },
            'block-glitch': { name: 'Blocos', iconClass: 'trans-block-glitch', icon: 'fa-th-large' },
            'cyber-zoom': { name: 'Cyber Zoom', iconClass: 'trans-cyber-zoom', icon: 'fa-microchip' },
            'scan-line-v': { name: 'Scan V', iconClass: 'trans-scan-v', icon: 'fa-grip-lines-vertical' },
            'color-tear': { name: 'Rasgo de Cor', iconClass: 'trans-color-tear', icon: 'fa-palette' },
            'digital-noise': { name: 'Ruído Digital', iconClass: 'trans-digital-noise', icon: 'fa-braille' }
        },
        'Líquido & Orgânico': {
            'liquid-melt': { name: 'Derreter', iconClass: 'trans-liquid', icon: 'fa-tint' },
            'ink-splash': { name: 'Tinta', iconClass: 'trans-ink', icon: 'fa-fill-drip' },
            'oil-paint': { name: 'Óleo', iconClass: 'trans-oil', icon: 'fa-paint-brush' },
            'water-ripple': { name: 'Ondulação', iconClass: 'trans-ripple', icon: 'fa-water' },
            'smoke-reveal': { name: 'Fumaça', iconClass: 'trans-smoke', icon: 'fa-cloud' },
            'bubble-pop': { name: 'Bolha', iconClass: 'trans-bubble', icon: 'fa-soap' }
        },
        'Formas & Mosaico': {
            'mosaic-small': { name: 'Mosaico P', iconClass: 'trans-mosaic-s', icon: 'fa-border-all' },
            'mosaic-large': { name: 'Mosaico G', iconClass: 'trans-mosaic-l', icon: 'fa-table' },
            'triangle-wipe': { name: 'Triângulos', iconClass: 'trans-triangle', icon: 'fa-play' },
            'star-zoom': { name: 'Estrela', iconClass: 'trans-star', icon: 'fa-star' },
            'spiral-wipe': { name: 'Espiral', iconClass: 'trans-spiral', icon: 'fa-spinner' },
            'grid-flip': { name: 'Grid Flip', iconClass: 'trans-grid-flip', icon: 'fa-th' },
            'dots-reveal': { name: 'Pontos', iconClass: 'trans-dots', icon: 'fa-ellipsis-h' }
        },
        'Papel & Textura': {
            'page-turn': { name: 'Virar Pág.', iconClass: 'trans-page-turn', icon: 'fa-file' },
            'paper-rip': { name: 'Rasgar', iconClass: 'trans-rip', icon: 'fa-cut' },
            'burn-paper': { name: 'Queimar', iconClass: 'trans-burn-paper', icon: 'fa-fire-alt' },
            'sketch-reveal': { name: 'Rascunho', iconClass: 'trans-sketch', icon: 'fa-pencil-alt' },
            'fold-up': { name: 'Dobrar', iconClass: 'trans-fold', icon: 'fa-folder' }
        },
        'Transformação 3D': {
            'cube-rotate-l': { name: 'Cubo Esq.', iconClass: 'trans-cube-l', icon: 'fa-cube' },
            'cube-rotate-r': { name: 'Cubo Dir.', iconClass: 'trans-cube-r', icon: 'fa-cube' },
            'cube-rotate-u': { name: 'Cubo Cima', iconClass: 'trans-cube-u', icon: 'fa-arrow-up' },
            'cube-rotate-d': { name: 'Cubo Baixo', iconClass: 'trans-cube-d', icon: 'fa-arrow-down' },
            'door-open': { name: 'Porta', iconClass: 'trans-door', icon: 'fa-door-open' },
            'flip-card': { name: 'Cartão', iconClass: 'trans-flip', icon: 'fa-sd-card' },
            'room-fly': { name: 'Quarto', iconClass: 'trans-room', icon: 'fa-home' }
        },
        'Zoom & Spin Complexos': {
            'zoom-blur-l': { name: 'Zoom Blur E', iconClass: 'trans-zoom-blur-l', icon: 'fa-search' },
            'zoom-blur-r': { name: 'Zoom Blur D', iconClass: 'trans-zoom-blur-r', icon: 'fa-search' },
            'spin-zoom-in': { name: 'Spin In', iconClass: 'trans-spin-in', icon: 'fa-sync' },
            'spin-zoom-out': { name: 'Spin Out', iconClass: 'trans-spin-out', icon: 'fa-undo' },
            'whip-diagonal-1': { name: 'Whip Diag 1', iconClass: 'trans-whip-d1', icon: 'fa-location-arrow' },
            'whip-diagonal-2': { name: 'Whip Diag 2', iconClass: 'trans-whip-d2', icon: 'fa-location-arrow' }
        },
        'Luz & Ótica': {
            'flash-bang': { name: 'Flash Bang', iconClass: 'trans-flash-bang', icon: 'fa-sun' },
            'exposure': { name: 'Exposição', iconClass: 'trans-exposure', icon: 'fa-lightbulb' },
            'burn': { name: 'Burn', iconClass: 'trans-burn', icon: 'fa-fire' },
            'bokeh-blur': { name: 'Desfoque Bokeh', iconClass: 'trans-bokeh', icon: 'fa-braille' },
            'light-leak-tr': { name: 'Vazamento Luz', iconClass: 'trans-leak', icon: 'fa-rainbow' },
            'flare-pass': { name: 'Flare Pass', iconClass: 'trans-flare', icon: 'fa-meteor' },
            'prism-split': { name: 'Prisma', iconClass: 'trans-prism', icon: 'fa-caret-up' },
            'god-rays': { name: 'Raios', iconClass: 'trans-god-rays', icon: 'fa-sun' }
        },
        'Movimento Elástico': {
            'elastic-left': { name: 'Elástico Esq.', iconClass: 'trans-elastic-left', icon: 'fa-arrow-left' },
            'elastic-right': { name: 'Elástico Dir.', iconClass: 'trans-elastic-right', icon: 'fa-arrow-right' },
            'elastic-up': { name: 'Elástico Cima', iconClass: 'trans-elastic-up', icon: 'fa-arrow-up' },
            'elastic-down': { name: 'Elástico Baixo', iconClass: 'trans-elastic-down', icon: 'fa-arrow-down' },
            'bounce-scale': { name: 'Bounce Zoom', iconClass: 'trans-bounce-scale', icon: 'fa-compress-arrows-alt' },
            'jelly': { name: 'Jelly', iconClass: 'trans-jelly', icon: 'fa-bacterium' }
        },
        'Camera 3D': {
            'zoom-in': { name: 'Zoom In', iconClass: 'trans-zoom-in', icon: 'fa-search-plus' }, 
            'zoom-out': { name: 'Zoom Out', iconClass: 'trans-zoom-out', icon: 'fa-search-minus' }, 
            'zoom-spin-fast': { name: 'Zoom Spin', iconClass: 'trans-zoom-spin-fast', icon: 'fa-circle-notch' },
            'spin-cw': { name: 'Giro Hor.', iconClass: 'trans-spin-cw', icon: 'fa-rotate-right' }, 
            'spin-ccw': { name: 'Giro Anti-H.', iconClass: 'trans-spin-ccw', icon: 'fa-rotate-left' },
            'whip-left': { name: 'Whip Esq.', iconClass: 'trans-whip-left', icon: 'fa-arrow-left' },
            'whip-right': { name: 'Whip Dir.', iconClass: 'trans-whip-right', icon: 'fa-arrow-right' },
            'whip-up': { name: 'Whip Cima', iconClass: 'trans-whip-up', icon: 'fa-arrow-up' },
            'whip-down': { name: 'Whip Baixo', iconClass: 'trans-whip-down', icon: 'fa-arrow-down' },
            'perspective-left': { name: 'Perspectiva E.', iconClass: 'trans-persp-left', icon: 'fa-door-open' },
            'perspective-right': { name: 'Perspectiva D.', iconClass: 'trans-persp-right', icon: 'fa-door-closed' }
        },
        'Glitch & Cyber': { 
            'glitch': { name: 'Glitch', iconClass: 'trans-glitch', icon: 'fa-bug' }, 
            'glitch-scan': { name: 'Scanline', iconClass: 'trans-glitch-scan', icon: 'fa-barcode' }, 
            'pixelize': { name: 'Pixelizar', iconClass: 'trans-pixelize', icon: 'fa-th' },
            'datamosh': { name: 'Datamosh', iconClass: 'trans-datamosh', icon: 'fa-ghost' },
            'rgb-split': { name: 'RGB Split', iconClass: 'trans-rgb-split', icon: 'fa-layer-group' },
            'noise-jump': { name: 'Ruído', iconClass: 'trans-noise', icon: 'fa-tv' },
            'cyber-slice': { name: 'Cyber Slice', iconClass: 'trans-slice', icon: 'fa-cut' }
        },
        'Movimento / Slide': { 
            'slide-left': { name: 'Slide Esq.', iconClass: 'trans-slide-left', icon: 'fa-chevron-left' }, 
            'slide-right': { name: 'Slide Dir.', iconClass: 'trans-slide-right', icon: 'fa-chevron-right' }, 
            'slide-up': { name: 'Slide Cima', iconClass: 'trans-slide-up', icon: 'fa-chevron-up' }, 
            'slide-down': { name: 'Slide Baixo', iconClass: 'trans-slide-down', icon: 'fa-chevron-down' },
            'push-left': { name: 'Empurrar E', iconClass: 'trans-push-left', icon: 'fa-hand-point-left' },
            'push-right': { name: 'Empurrar D', iconClass: 'trans-push-right', icon: 'fa-hand-point-right' }
        },
        'Warp & Distorção': {
            'swirl': { name: 'Redemoinho', iconClass: 'trans-swirl', icon: 'fa-spinner' },
            'kaleidoscope': { name: 'Caleidosc.', iconClass: 'trans-kaleidoscope', icon: 'fa-snowflake' },
            'water-drop': { name: 'Gota', iconClass: 'trans-water-drop', icon: 'fa-tint' },
            'wave': { name: 'Onda', iconClass: 'trans-wave', icon: 'fa-water' },
            'stretch-h': { name: 'Esticar H', iconClass: 'trans-stretch-h', icon: 'fa-arrows-left-right' },
            'stretch-v': { name: 'Esticar V', iconClass: 'trans-stretch-v', icon: 'fa-arrows-up-down' },
            'morph': { name: 'Morph', iconClass: 'trans-morph', icon: 'fa-bezier-curve' },
            'turbulence': { name: 'Turbulência', iconClass: 'trans-turb', icon: 'fa-wind' }
        },
        'Geometria & Máscaras': {
            'circle-open': { name: 'Círculo Abre', iconClass: 'trans-circle-open', icon: 'fa-circle' },
            'shutters': { name: 'Persianas', iconClass: 'trans-shutters', icon: 'fa-bars' },
            'wipe-radial': { name: 'Radar', iconClass: 'trans-wipe-radial', icon: 'fa-fan' },
            'checkerboard': { name: 'Xadrez', iconClass: 'trans-checkerboard', icon: 'fa-chess-board' },
            'diamond-zoom': { name: 'Diamante', iconClass: 'trans-diamond', icon: 'fa-gem' },
            'hex-reveal': { name: 'Hexágono', iconClass: 'trans-hex', icon: 'fa-cube' },
            'stripes-h': { name: 'Listras H', iconClass: 'trans-stripes-h', icon: 'fa-grip-lines' },
            'stripes-v': { name: 'Listras V', iconClass: 'trans-stripes-v', icon: 'fa-grip-lines-vertical' },
            'heart-wipe': { name: 'Coração', iconClass: 'trans-heart', icon: 'fa-heart' }
        },
        'Cinematográfico': {
             'luma-fade': { name: 'Luma Fade', iconClass: 'trans-luma', icon: 'fa-moon' },
             'film-roll': { name: 'Rolo de Filme', iconClass: 'trans-film-roll', icon: 'fa-film' },
             'blur-warp': { name: 'Blur Warp', iconClass: 'trans-blur-warp', icon: 'fa-infinity' }
        }
    },
    // MERGE EXISTING MOVEMENTS WITH NEW 50+
    movements: {
        'Câmera - Zoom (3D)': {
            'kenBurns': { name: 'Ken Burns (Pro)', type: 'kenBurns', controls: { startScale: { min: 1, max: 2, step: 0.1, default: 1 }, endScale: { min: 1, max: 2, step: 0.1, default: 1.5 }, startX: { min: -50, max: 50, step: 1, default: 0 }, startY: { min: -50, max: 50, step: 1, default: 0 }, endX: { min: -50, max: 50, step: 1, default: 0 }, endY: { min: -50, max: 50, step: 1, default: 0 } } },
            'parallax': { name: 'Parallax 3D (Efeito de Profundidade)', type: 'parallax', controls: { intensity: { min: 0, max: 10, step: 0.5, default: 5 }, direction: { min: -180, max: 180, step: 1, default: 0 } } },
            'zoom-slow-in': { name: 'Zoom Lento In', type: 'animation', controls: { speed: { min: 0.1, max: 3, step: 0.1, default: 0.5 } } },
            'zoom-fast-in': { name: 'Zoom Rápido In', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 2 } } },
            'zoom-slow-out': { name: 'Zoom Lento Out', type: 'animation', controls: { speed: { min: 0.1, max: 3, step: 0.1, default: 0.5 } } },
            'zoom-bounce': { name: 'Zoom Bounce', type: 'animation', controls: { speed: { min: 0.1, max: 3, step: 0.1, default: 1 } } },
            'dolly-zoom': { name: 'Dolly Zoom', type: 'animation', controls: { speed: { min: 0.1, max: 3, step: 0.1, default: 1 } } }
        },
           'Desfoque (Blur)': {
            'mov-blur-in': { name: 'Blur In (Focar)', type: 'animation', controls: { speed: { min: 0.1, max: 2, default: 1, step: 0.1 } } },
            'mov-blur-out': { name: 'Blur Out (Desfocar)', type: 'animation', controls: { speed: { min: 0.1, max: 2, default: 1, step: 0.1 } } },
            'mov-blur-pulse': { name: 'Blur Pulse', type: 'animation', controls: { speed: { min: 0.1, max: 3, default: 1, step: 0.1 } } },
            'mov-blur-zoom': { name: 'Blur Zoom', type: 'animation', controls: { speed: { min: 0.1, max: 2, default: 1, step: 0.1 } } },
            'mov-blur-motion': { name: 'Motion Blur H', type: 'animation', controls: { intensity: { min: 1, max: 20, default: 10, step: 1 } } }
        },
        'Câmera - Shake (Tremor)': {
            'handheld-1': { name: 'Mão Suave', type: 'animation', controls: { intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'handheld-2': { name: 'Mão Instável', type: 'animation', controls: { intensity: { min: 0.1, max: 10, step: 0.1, default: 2 } } },
            'shake-hard': { name: 'Tremor Forte', type: 'animation', controls: { intensity: { min: 1, max: 20, step: 1, default: 5 } } },
            'earthquake': { name: 'Terremoto', type: 'animation', controls: { intensity: { min: 1, max: 50, step: 1, default: 15 } } },
            'jitter': { name: 'Jitter', type: 'animation', controls: { intensity: { min: 1, max: 30, step: 1, default: 10 } } }
        },
        'Animações de Entrada': {
            'slide-in-left': { name: 'Entrar Esq.', type: 'animation', controls: { duration: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'slide-in-right': { name: 'Entrar Dir.', type: 'animation', controls: { duration: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'slide-in-bottom': { name: 'Entrar Baixo', type: 'animation', controls: { duration: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'pop-in': { name: 'Pop In', type: 'animation', controls: { duration: { min: 0.1, max: 3, step: 0.1, default: 0.5 } } },
            'fade-in': { name: 'Fade In', type: 'animation', controls: { duration: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'swing-in': { name: 'Swing In', type: 'animation', controls: { duration: { min: 0.1, max: 5, step: 0.1, default: 1 } } }
        },
        'Animações de Loop': {
            'pulse': { name: 'Pulsar', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'float': { name: 'Flutuar', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'wiggle': { name: 'Wiggle', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'heartbeat': { name: 'Batida', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'spin-slow': { name: 'Giro Lento', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'pendulum': { name: 'Pêndulo', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } }
        },
        'Efeitos Premium (Top 10)': {
            'mov-cinematic-bloom': { name: 'Cinematic Bloom (Glow)', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-vhs-pro': { name: 'VHS Retro Pro', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-old-film': { name: 'Cinema Antigo 1920', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-cyber-neon': { name: 'Cyber Neon Pulse', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-liquid-ripple': { name: 'Liquid Ripple (Onda)', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-prism-flare': { name: 'Prism Light Flare', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-crt-scanline': { name: 'CRT Monitor Scan', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-dreamy-blur': { name: 'Dreamy Ethereal', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-speed-ramp': { name: 'Speed Ramp Visual', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-vertigo-pro': { name: 'Vertigo Dolly Pro', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } }
        },
        'AI Master Effects (Top 10)': {
            'mov-ai-depth-zoom': { name: 'AI Depth Zoom (3D)', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-ai-face-focus': { name: 'AI Face Focus', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-ai-object-tracking': { name: 'AI Object Tracking', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-ai-sky-motion': { name: 'AI Sky Motion', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-ai-particle-flow': { name: 'AI Particle Flow', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-ai-glitch-art': { name: 'AI Glitch Art', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-ai-time-warp': { name: 'AI Time Warp', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-ai-color-shift': { name: 'AI Dynamic Color', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-ai-perspective-warp': { name: 'AI Perspective Warp', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-ai-cinematic-shake': { name: 'AI Cinematic Shake', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } }
        },
        'Efeitos de Distorção & Arte': {
            'mov-glitch-vortex': { name: 'Vortex Glitch', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-mirage-wave': { name: 'Onda de Calor', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-kaleidoscope': { name: 'Caleidoscópio', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 1, max: 10, step: 1, default: 4 } } },
            'mov-zoom-warp': { name: 'Zoom Warp', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-chromatic-pulse': { name: 'Pulso Cromático', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-scanline-flicker': { name: 'Flicker de TV', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-vignette-pulse': { name: 'Vignette Pulsante', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-edge-glow': { name: 'Bordas Neon', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-pixel-drift': { name: 'Pixel Drift', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-spiral-zoom': { name: 'Zoom Espiral', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } }
        },
        'Efeitos de Foto': {
            'photo-flash': { name: 'Flash Foto', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'rgb-split-anim': { name: 'RGB Split', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } },
            'mov-vhs-tracking': { name: 'VHS Tracking', type: 'animation', controls: { speed: { min: 0.1, max: 5, step: 0.1, default: 1 }, intensity: { min: 0.1, max: 5, step: 0.1, default: 1 } } }
        },
        ...generatedMovements // Appending 50+ new movements here
    }
};