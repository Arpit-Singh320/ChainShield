// AI Analysis Service using Google Gemini 2.0 Flash
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Load environment variables from project root .env (resolve relative to this file)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Initialize Google Generative AI with API key
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export class InsuranceAIAnalyzer {
  /**
   * Analyzes an insurance claim using Gemini 2.0 Flash
   * @param {Object} claimData - Data about the claim
   * @param {string} claimData.description - Description of the claim
   * @param {string[]} claimData.evidenceHashes - IPFS hashes of evidence files
   * @param {string} claimData.policyType - Type of policy (auto, home, health, travel)
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeClaim(claimData) {
    const { description, evidenceHashes, policyType } = claimData;
    
    // Process evidence from IPFS
    const evidenceTexts = await this.processEvidence(evidenceHashes);
    
    // Build the prompt for Gemini
    const prompt = this.buildAnalysisPrompt(description, evidenceTexts, policyType);
    console.log("[AI] Built analysis prompt (truncated to 1500 chars):\n", prompt.slice(0, 1500));
    
    try {
      // Use Gemini 2.0 Flash for analysis
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      
      // Generate AI response
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2, // Low temperature for more deterministic results
          maxOutputTokens: 1024,
        },
      });

      const response = result.response;
      const text = response.text();
      console.log("[AI] Raw response text (truncated to 1500 chars):\n", (text || "").slice(0, 1500));
      
      // Parse the JSON from the response
      return this.parseAIResponse(text);
    } catch (error) {
      console.error('AI Analysis failed:', error);
      return this.getDefaultAnalysis();
    }
  }
  
  /**
   * Builds the prompt for the AI to analyze the insurance claim
   */
  buildAnalysisPrompt(description, evidenceTexts, policyType) {
    return `
    You are an expert insurance claims analyst. Analyze this ${policyType} insurance claim objectively.
    
    CLAIM DESCRIPTION: ${description}
    
    EVIDENCE ANALYSIS: ${evidenceTexts.join('\n')}
    
    Analyze the claim and provide your assessment in JSON format with the following fields:
    {
      "claimType": [0-3 integer where 0=auto, 1=home, 2=health, 3=travel],
      "severity": [1-10 integer representing damage/injury severity],
      "fraudRisk": [0-100 integer representing percentage likelihood of fraud],
      "recommendedPayout": [integer USD amount, set to 0 if claim should be rejected],
      "reasoning": [brief explanation of your analysis],
      "confidence": [0-100 integer representing your confidence in this analysis]
    }
    
    FRAUD INDICATORS TO CHECK:
    - Inconsistent timeline or narrative
    - Excessive or unrealistic damage claims
    - Missing or contradictory documentation
    - Suspicious circumstances
    - Previous claim history patterns
    - Vague descriptions lacking specific details
    
    ONLY RESPOND WITH THE JSON OBJECT. Do not include any other text.
    `;
  }
  
  /**
   * Parses the AI response and validates the data
   */
  parseAIResponse(aiResponse) {
    try {
      // Extract JSON object from response (handles cases where AI outputs additional text)
      const jsonMatch = aiResponse.match(/({[\s\S]*})/);
      const jsonString = jsonMatch ? jsonMatch[0] : aiResponse;
      
      const analysis = JSON.parse(jsonString);
      
      // Validate and sanitize AI response
      return {
        claimType: Math.max(0, Math.min(3, analysis.claimType || 0)),
        severity: Math.max(1, Math.min(10, analysis.severity || 5)),
        fraudRisk: Math.max(0, Math.min(100, analysis.fraudRisk || 50)),
        recommendedPayout: Math.max(0, analysis.recommendedPayout || 0),
        reasoning: analysis.reasoning || "No reasoning provided",
        confidence: Math.max(0, Math.min(100, analysis.confidence || 50))
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return this.getDefaultAnalysis();
    }
  }
  
  /**
   * Processes evidence from IPFS hashes
   */
  async processEvidence(evidenceHashes) {
    const evidenceTexts = [];
    
    for (const hash of evidenceHashes) {
      try {
        // Fetch from IPFS
        console.log(`[AI] Fetching evidence from IPFS: ${hash}`);
        const response = await axios.get(`https://ipfs.io/ipfs/${hash}`, {
          timeout: 10000, // 10 second timeout
        });
        
        // If it's an image, use Gemini Vision API for analysis
        if (this.isImageHash(hash)) {
          console.log(`[AI] Detected image evidence for hash ${hash}, invoking image analysis...`);
          const imageAnalysis = await this.analyzeImage(response.data);
          console.log(`[AI] Image analysis result (truncated):`, (imageAnalysis || '').slice(0, 300));
          evidenceTexts.push(`Image Analysis: ${imageAnalysis}`);
        } else {
          // For text documents
          console.log(`[AI] Treating evidence ${hash} as text/json.`);
          evidenceTexts.push(`Document: ${typeof response.data === 'string' ? response.data : JSON.stringify(response.data)}`);
        }
      } catch (error) {
        evidenceTexts.push(`Evidence ${hash}: Unable to process (${error.message})`);
        console.warn(`[AI] Failed to process evidence ${hash}:`, error.message);
      }
    }
    
    return evidenceTexts;
  }
  
  /**
   * Analyzes an image using Gemini Vision API
   */
  async analyzeImage(imageData) {
    try {
      // Convert image to base64 if it's not already
      const base64Image = typeof imageData === 'string' && imageData.startsWith('data:image') 
        ? imageData 
        : `data:image/jpeg;base64,${Buffer.from(imageData).toString('base64')}`;
      
      // Use Gemini Pro Vision for image analysis
      const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
      
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { text: "Analyze this insurance claim evidence image. Describe what you see and any damage or relevant details. Focus on identifying potential fraud indicators." },
              { inline_data: { mime_type: "image/jpeg", data: base64Image } }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 300,
        },
      });

      const text = result.response.text();
      console.log("[AI] Vision response text (truncated to 600 chars):\n", (text || '').slice(0, 600));
      return text;
    } catch (error) {
      console.error('Image analysis failed:', error);
      return "Image analysis unavailable due to technical error";
    }
  }
  
  /**
   * Determines if a hash is likely to be an image
   */
  isImageHash(hash) {
    // This is a simplistic check - in production, you'd query IPFS metadata
    return hash.includes('image') || hash.includes('photo') || hash.includes('picture');
  }
  
  /**
   * Returns default analysis when AI fails
   */
  getDefaultAnalysis() {
    return {
      claimType: 0,
      severity: 5,
      fraudRisk: 50,
      recommendedPayout: 0,
      reasoning: "AI analysis unavailable, requires human review",
      confidence: 0
    };
  }
}
