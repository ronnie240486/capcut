
import { GoogleGenAI, VideoGenerationReferenceType, Modality } from "@google/genai";
import { EditorMode } from "../types";

export class GeminiVideoService {
  private static getAI(apiKey?: string) {
    const key = apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!key) throw new Error("API Key is required for video generation");
    return new GoogleGenAI({ apiKey: key });
  }

  static async generateVideo(params: {
    prompt: string;
    aspectRatio: '16:9' | '9:16';
    resolution: '720p' | '1080p';
    model: 'veo-3.1-lite-generate-preview' | 'veo-3.1-generate-preview' | 'google/lyria-3-pro-preview';
    image?: string; // base64
    lastFrame?: string; // base64
    referenceImages?: string[];
    apiKey?: string; // Allow passing dynamic key
    onProgress?: (msg: string) => void;
  }): Promise<string> {
    const ai = this.getAI(params.apiKey);
    
    const config: any = {
      numberOfVideos: 1,
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
    };

    const payload: any = {
      model: params.model,
      prompt: params.prompt,
      config,
    };

    if (params.image) {
      payload.image = {
        imageBytes: params.image.includes('base64,') ? params.image.split(',')[1] : params.image,
        mimeType: 'image/png'
      };
    }

    if (params.lastFrame) {
      payload.config.lastFrame = {
        imageBytes: params.lastFrame.includes('base64,') ? params.lastFrame.split(',')[1] : params.lastFrame,
        mimeType: 'image/png'
      };
    }

    if (params.referenceImages && params.referenceImages.length > 0) {
       payload.model = 'veo-3.1-generate-preview';
       config.resolution = '720p';
       config.aspectRatio = '16:9';

       const referenceImagesPayload: any[] = [];
       for (const img of params.referenceImages) {
         const base64Data = img.includes('base64,') ? img.split(',')[1] : img;
         referenceImagesPayload.push({
           image: {
             imageBytes: base64Data,
             mimeType: 'image/png',
           },
           referenceType: VideoGenerationReferenceType.ASSET,
         });
       }
       config.referenceImages = referenceImagesPayload;
    }

    let operation = await ai.models.generateVideos(payload);

    while (!operation.done) {
      const statusMsg = `Generating video frames (${params.model})...`;
      console.log(`[GeminiVideo] Polling operation: ${operation.name || 'unknown'}`);
      params.onProgress?.(statusMsg);
      await new Promise(resolve => setTimeout(resolve, 5000));
      const aiPolling = this.getAI(params.apiKey);
      // Polling with the operation object
      operation = await aiPolling.operations.getVideosOperation({ operation: operation });
      
      if (operation.error) {
        throw new Error(`Video generation failed: ${operation.error.message || JSON.stringify(operation.error)}`);
      }
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error(`Video generation failed - no URI returned. Response: ${JSON.stringify(operation.response)}`);

    console.log(`[GeminiVideo] Generation complete. Downloading from: ${downloadLink}`);
    
    // Skill guideline: prefer x-goog-api-key header for authenticated fetch
    const apiKey = params.apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;
    const response = await fetch(downloadLink, {
        headers: {
            'x-goog-api-key': apiKey || ''
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GeminiVideo] Download failed with status ${response.status}: ${errorText}`);
        throw new Error(`Falha ao baixar o vídeo gerado (${response.status})`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  static async generateMusic(params: {
    prompt: string;
    duration?: number;
    usePro?: boolean;
    apiKey?: string;
  }): Promise<string> {
    const ai = this.getAI(params.apiKey);
    const model = params.usePro ? "lyria-3-pro-preview" : "lyria-3-clip-preview";

    console.log(`[GeminiMusic] Generating music with model: ${model}, prompt: ${params.prompt}`);

    const response = await ai.models.generateContentStream({
      model,
      contents: params.prompt,
      config: {
        responseModalities: [Modality.AUDIO]
      }
    });

    let audioBase64 = "";
    let mimeType = "audio/wav";

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (!audioBase64 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioBase64 += part.inlineData.data;
        }
      }
    }

    if (!audioBase64) {
      throw new Error("No music data returned from Gemini Lyria.");
    }

    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  }

  static async extendVideo(params: {
    prompt: string;
    previousOperationId: any; 
    aspectRatio: '16:9' | '9:16';
    apiKey?: string;
    onProgress?: (msg: string) => void;
  }): Promise<string> {
    const ai = this.getAI(params.apiKey);

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: params.prompt,
      video: params.previousOperationId,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: params.aspectRatio,
      }
    });

    while (!operation.done) {
      params.onProgress?.("Extending cinematic sequence...");
      await new Promise(resolve => setTimeout(resolve, 5000));
      const aiPolling = this.getAI(params.apiKey);
      operation = await aiPolling.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Extension failed");

    const separator = downloadLink.includes('?') ? '&' : '?';
    const response = await fetch(`${downloadLink}${separator}key=${params.apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  static async generateTTS(params: {
    text: string;
    voice: string;
    style?: string;
    speed?: number;
    pitch?: number;
    systemInstruction?: string;
    apiKey?: string;
  }): Promise<string> {
    const ai = this.getAI(params.apiKey);
    
    if (!params.text || params.text.trim() === '') {
      throw new Error("TTS Error: Text to speak cannot be empty.");
    }

    const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    if (!validVoices.includes(params.voice)) {
      console.warn(`Invalid voice requested: ${params.voice}. Falling back to Kore.`);
      params.voice = 'Kore';
    }

    // Clean text to avoid common triggers for finishReason: OTHER
    // (unsupported control chars or unusual invisible unicode)
    const cleanText = params.text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "").trim();

    console.log(`[GeminiTTS] Sending request for voice: ${params.voice}, text length: ${cleanText.length}`);

    const generateCall = async (textToUse: string) => {
      // Merge systemInstruction into the main prompt since this preview model doesn't support developer_instructions field
      const finalPrompt = params.systemInstruction 
        ? `${params.systemInstruction}\n\nTEXT TO SPEAK:\n${textToUse}`
        : textToUse;

      const request: any = {
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: finalPrompt }] }],
        safetySettings: [
          { category: 'HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
        ],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: params.voice
              }
            }
          }
        }
      };

      const result = await ai.models.generateContent(request);

      if (!result.candidates || result.candidates.length === 0) {
        throw new Error("No candidates returned from Gemini TTS.");
      }

      return result.candidates[0];
    };

    let candidate;
    try {
      candidate = await generateCall(cleanText);
      
      // If result is blocked or OTHER, try ONE retry with even simpler text (no instructions in-line)
      if (candidate.finishReason === 'OTHER') {
         console.warn("[GeminiTTS] finishReason: OTHER detected. Retrying with stripped text...");
         // If there was an instruction-heavy format, try to extract just the text
         const fallbackText = cleanText.split('throughout:').pop()?.trim() || cleanText;
         candidate = await generateCall(fallbackText);
      }
    } catch (e: any) {
      console.error("[GeminiTTS] Error during call:", e);
      throw e;
    }

    // Final check for candidate failure
    if (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
      if (candidate.finishReason === 'OTHER') {
        throw new Error("TTS failed with finish reason: OTHER. This can happen due to internal model issues, regional restrictions, or unsupported characters in the text. Try simplifying your text.");
      }
      throw new Error(`TTS failed with finish reason: ${candidate.finishReason}. Check for safety filters or prompt violations.`);
    }

    const parts = candidate.content?.parts || [];
    let audioDataBase64: string | undefined;

    for (const part of parts) {
      if (part.inlineData?.data) {
        audioDataBase64 = part.inlineData.data;
        break;
      }
    }

    if (!audioDataBase64) {
      throw new Error("No audio data returned in any part of the Gemini response.");
    }

    return audioDataBase64;
  }

  static async generateImage(prompt: string, aspectRatio: string = '1:1', apiKey?: string) {
    const key = apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!key) throw new Error("API Key is required");
    const genAI = new GoogleGenAI({ apiKey: key });
    
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any
        }
      } as any
    });
    
    for (const part of result.candidates?.[0]?.content?.parts || []) {
      if ((part as any).inlineData?.data) {
        return `data:image/png;base64,${(part as any).inlineData.data}`;
      }
    }
    
    throw new Error("Image generation failed - no data returned");
  }
  static async generateMorphTransition(params: {
    startImage: string;
    endImage: string;
    prompt?: string;
    apiKey?: string;
    onProgress?: (msg: string) => void;
  }): Promise<string> {
    const prompt = params.prompt || "A cinematic and fluid morphing transition from the first image to the second image. The visual content should smoothly transform and blend between the two scenes.";
    
    // We use veo-3.1-lite-generate-preview with start and end images (image and lastFrame)
    // for better accessibility as it's more likely to be available than the pro version
    // and correctly implements a morph between two points.
    return this.generateVideo({
      prompt,
      aspectRatio: '16:9',
      resolution: '720p',
      model: 'veo-3.1-lite-generate-preview',
      image: params.startImage,
      lastFrame: params.endImage,
      apiKey: params.apiKey,
      onProgress: params.onProgress
    });
  }
}

export const generateTTS = GeminiVideoService.generateTTS.bind(GeminiVideoService);
export const generateImage = GeminiVideoService.generateImage.bind(GeminiVideoService);
export const generateVideo = GeminiVideoService.generateVideo.bind(GeminiVideoService);
export const generateMusic = GeminiVideoService.generateMusic.bind(GeminiVideoService);
export const generateMorphTransition = GeminiVideoService.generateMorphTransition.bind(GeminiVideoService);

export async function generateCompletion(messages: any[], apiKey?: string) {
  const key = apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("API Key is required");
  const genAI = new GoogleGenAI({ apiKey: key });
  
  const result = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }]
    }))
  });
  
  return result.text;
}

export async function editContent(content: string, instruction: string, mode: 'TEXT' | 'CODE', apiKey?: string) {
  const key = apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("API Key is required");
  const genAI = new GoogleGenAI({ apiKey: key });
  
  const prompt = `
    You are an expert editor. 
    Mode: ${mode}
    Instruction: ${instruction}
    
    Current Content:
    ${content}
    
    Return ONLY the modified content. No explanations.
  `;
  
  const result = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });
  
  return result.text;
}
