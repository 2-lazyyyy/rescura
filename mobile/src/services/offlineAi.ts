import * as FileSystem from 'expo-file-system/legacy';
import { initLlama, LlamaContext } from 'llama.rn';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { retrieveKnowledge } from '../data/firstAidKnowledge';

const MODEL_FILENAME = 'qwen1_5-0_5b-chat-q4_k_m.gguf';
// Using Qwen 0.5B Chat Q4_K_M for excellent mobile performance/size ratio (~350MB)
const MODEL_URL = 'https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF/resolve/main/qwen1_5-0_5b-chat-q4_k_m.gguf';

let llamaContext: LlamaContext | null = null;

export async function getModelPath(): Promise<string> {
  return `${FileSystem.documentDirectory}${MODEL_FILENAME}`;
}

export async function checkModelExists(): Promise<boolean> {
  const path = await getModelPath();
  const info = await FileSystem.getInfoAsync(path);
  return info.exists;
}

export async function downloadModel(
  onProgress?: (progress: number) => void
): Promise<boolean> {
  const path = await getModelPath();
  
  const downloadResumable = FileSystem.createDownloadResumable(
    MODEL_URL,
    path,
    {},
    (downloadProgress) => {
      const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      if (onProgress) {
        onProgress(progress);
      }
    }
  );

  try {
    const result = await downloadResumable.downloadAsync();
    if (result && result.status === 200) {
      await AsyncStorage.setItem('offline_model_downloaded', 'true');
      return true;
    }
    return false;
  } catch (e) {
    console.error('Model download error:', e);
    return false;
  }
}

export async function deleteModel(): Promise<void> {
  const path = await getModelPath();
  const exists = await checkModelExists();
  if (exists) {
    await FileSystem.deleteAsync(path);
  }
  await AsyncStorage.removeItem('offline_model_downloaded');
  
  if (llamaContext) {
    await llamaContext.release();
    llamaContext = null;
  }
}

export async function initializeLocalLlama(): Promise<boolean> {
  if (llamaContext) return true; // Already initialized
  
  const exists = await checkModelExists();
  if (!exists) {
    throw new Error('Model not downloaded yet');
  }

  const path = await getModelPath();
  // Strip 'file://' prefix because the underlying C++ fopen() does not support it
  const formattedPath = path.replace('file://', '');
  
  try {
    llamaContext = await initLlama({
      model: formattedPath,
      use_mlock: true,
      n_ctx: 1024, // Keep context window small for memory efficiency
    });
    return true;
  } catch (e) {
    console.error('Failed to initialize local llama:', e);
    return false;
  }
}

export async function askLocalLlama(
  message: string, 
  systemPrompt: string = "You are a helpful emergency assistant."
): Promise<string> {
  if (!llamaContext) {
    const initialized = await initializeLocalLlama();
    if (!initialized) {
      throw new Error('Failed to initialize AI engine');
    }
  }

  // Local RAG Retrieval
  const knowledge = retrieveKnowledge(message);
  let finalSystemPrompt = systemPrompt;
  
  if (knowledge) {
    finalSystemPrompt += `\n\nCRITICAL KNOWLEDGE REFERENCE (Use this to answer the user):\nTitle: ${knowledge.title}\n${knowledge.content}\n\nDo not invent steps. Only use the provided knowledge reference if it applies.`;
  }

  // Very basic prompt formatting for Qwen/ChatML style
  const prompt = `<|im_start|>system\n${finalSystemPrompt}<|im_end|>\n<|im_start|>user\n${message}<|im_end|>\n<|im_start|>assistant\n`;

  try {
    const response = await llamaContext!.completion({
      prompt,
      n_predict: 200, // Limit generation length
      temperature: 0.1, // Keep it deterministic and safe
      stop: ["<|im_end|>", "<|im_start|>"],
    });
    
    return response.text.trim();
  } catch (e) {
    console.error('Llama inference error:', e);
    throw new Error('Local AI failed to generate response');
  }
}
