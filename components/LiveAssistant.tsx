import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";

interface LiveAssistantProps {
    onGenerateImage: (prompt: string) => void;
    onChangeBackground: (color: string) => void;
    onAddText: (text: string) => void;
}

export const LiveAssistant: React.FC<LiveAssistantProps> = ({ onGenerateImage, onChangeBackground, onAddText }) => {
    const [isActive, setIsActive] = useState(false);
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [volume, setVolume] = useState(0);
    
    // Refs for audio processing
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sessionRef = useRef<Promise<any> | null>(null);
    const currentSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    const getApiKey = (): string => {
        try {
            const keys = JSON.parse(localStorage.getItem('proedit_api_keys') || '{}');
            return (keys.googleApiKey as string) || (process.env.API_KEY as string) || (process.env.GEMINI_API_KEY as string) || '';
        } catch {
            return (process.env.API_KEY as string) || (process.env.GEMINI_API_KEY as string) || '';
        }
    };

    const apiKey = getApiKey();

    // --- Audio Helpers ---
    const base64ToUint8Array = (base64: string) => {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    };

    const floatTo16BitPCM = (input: Float32Array) => {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    };

    const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    };

    // --- Tool Definitions ---
    const tools: FunctionDeclaration[] = [
        {
            name: 'change_background',
            description: 'Changes the background color of the video project.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    color: {
                        type: Type.STRING,
                        description: 'The hex color code (e.g., #FF0000) or CSS color name.',
                    },
                },
                required: ['color'],
            },
        },
        {
            name: 'generate_image',
            description: 'Generates an AI image based on a prompt and adds it to the project.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    prompt: {
                        type: Type.STRING,
                        description: 'The description of the image to generate.',
                    },
                },
                required: ['prompt'],
            },
        },
        {
            name: 'add_text',
            description: 'Adds a text overlay to the project.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    text: {
                        type: Type.STRING,
                        description: 'The content of the text to add.',
                    },
                },
                required: ['text'],
            },
        },
    ];

    const connect = async () => {
        if (!apiKey) {
            alert("API Key missing for Live Assistant");
            return;
        }

        setStatus('connecting');
        
        try {
            const ai = new GoogleGenAI({ apiKey });
            
            // Setup Audio Context
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            // Get User Media
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Setup Input Processing (Resample to 16kHz for Gemini)
            const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            sourceRef.current = source;
            processorRef.current = processor;

            source.connect(processor);
            processor.connect(inputCtx.destination);

            const config = {
                model: 'gemini-3.1-flash-live-preview',
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: {
                        parts: [{ text: "You are ProEdit Copilot, a helpful video editing assistant. You can control the editor to change background colors, generate images, and add text. Keep responses concise and helpful." }]
                    },
                    tools: [{ functionDeclarations: tools }],
                }
            };

            const sessionPromise = ai.live.connect({
                ...config,
                callbacks: {
                    onopen: () => {
                        console.log("Live Assistant Connected");
                        setStatus('connected');
                        setIsActive(true);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        // Handle Audio
                        const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audioData) {
                            playAudioChunk(audioData);
                        }

                        // Handle Tool Calls
                        if (message.toolCall) {
                            const functionResponses: any[] = [];
                            for (const call of message.toolCall.functionCalls) {
                                console.log("Tool Call:", call.name, call.args);
                                let result = "Done";
                                try {
                                    if (call.name === 'change_background' && call.args) {
                                        onChangeBackground(String((call.args as any).color));
                                        result = `Background changed to ${(call.args as any).color}`;
                                    } else if (call.name === 'generate_image' && call.args) {
                                        onGenerateImage(String((call.args as any).prompt));
                                        result = `Generating image: ${(call.args as any).prompt}`;
                                    } else if (call.name === 'add_text' && call.args) {
                                        onAddText(String((call.args as any).text));
                                        result = `Added text: ${(call.args as any).text}`;
                                    }
                                } catch (e: any) {
                                    result = `Error: ${e.message}`;
                                }
                                if (call.id && call.name) {
                                    functionResponses.push({
                                        id: call.id,
                                        name: call.name,
                                        response: { result: result }
                                    });
                                }
                            }
                            
                            if (functionResponses.length > 0) {
                                sessionPromise.then(session => {
                                    session.sendToolResponse({ functionResponses });
                                });
                            }
                        }
                    },
                    onclose: () => {
                        console.log("Live Assistant Closed");
                        handleDisconnect();
                    },
                    onerror: (err) => {
                        console.error("Live Assistant Error:", err);
                        handleDisconnect();
                    }
                }
            });

            sessionRef.current = sessionPromise;

            // Start Audio Streaming
            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Volume meter
                let sum = 0;
                for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
                setVolume(Math.sqrt(sum / inputData.length));

                const pcm16 = floatTo16BitPCM(inputData);
                const base64 = arrayBufferToBase64(pcm16.buffer);
                
                if (sessionRef.current) {
                    sessionRef.current.then(session => {
                        session.sendRealtimeInput({
                            audio: {
                                mimeType: "audio/pcm;rate=16000",
                                data: base64
                            }
                        });
                    }).catch(e => {
                        console.debug("Session not ready yet");
                    });
                }
            };

        } catch (e) {
            console.error("Connection Failed:", e);
            setStatus('disconnected');
        }
    };

    const playAudioChunk = async (base64Audio: string) => {
        if (!audioContextRef.current) return;
        
        try {
            const audioData = base64ToUint8Array(base64Audio);
            
            // Manual decoding for PCM 24kHz
            const dataInt16 = new Int16Array(audioData.buffer);
            const float32 = new Float32Array(dataInt16.length);
            for (let i = 0; i < dataInt16.length; i++) {
                float32[i] = dataInt16[i] / 32768.0;
            }

            const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
            buffer.copyToChannel(float32, 0);

            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);
            
            const currentTime = audioContextRef.current.currentTime;
            const startTime = Math.max(currentTime, nextStartTimeRef.current);
            
            source.start(startTime);
            nextStartTimeRef.current = startTime + buffer.duration;
            
            currentSourcesRef.current.add(source);
            source.onended = () => {
                currentSourcesRef.current.delete(source);
            };

        } catch (e) {
            console.error("Audio Decode Error:", e);
        }
    };

    const handleDisconnect = () => {
        setIsActive(false);
        setStatus('disconnected');
        setVolume(0);
        
        // Cleanup Audio
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        nextStartTimeRef.current = 0;
        
        // Close Session
        if (sessionRef.current) {
            sessionRef.current.then((s: any) => s.close());
            sessionRef.current = null;
        }
    };

    const toggleAssistant = () => {
        if (isActive) {
            handleDisconnect();
        } else {
            connect();
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
            {isActive && (
                <div className="bg-black/80 backdrop-blur-md border border-zinc-700 rounded-lg p-3 mb-2 shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5">
                    <div className="flex gap-1 items-center h-4">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div 
                                key={i} 
                                className="w-1 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full transition-all duration-75"
                                style={{ 
                                    height: `${Math.max(4, Math.min(24, volume * 100 * (Math.random() + 0.5)))}px` 
                                }}
                            ></div>
                        ))}
                    </div>
                    <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 animate-pulse">
                        Listening...
                    </span>
                </div>
            )}
            
            <button
                onClick={toggleAssistant}
                className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-110 border-2 ${
                    isActive 
                        ? 'bg-red-600 border-red-400 animate-pulse' 
                        : 'bg-gradient-to-br from-zinc-800 to-black border-zinc-600 hover:border-blue-500 group'
                }`}
                title="Gemini Live Assistant"
            >
                {status === 'connecting' ? (
                    <i className="fas fa-circle-notch fa-spin text-xl text-blue-400"></i>
                ) : (
                    <i className={`fas fa-microphone text-xl ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-blue-400'}`}></i>
                )}
            </button>
        </div>
    );
};
