
export interface FeedbackExample {
  type: 'dish' | 'drink';
  original: string; // The raw item name as first detected
  corrected: any; // The full object confirmed by user
  timestamp: number;
}

const STORAGE_KEY = 'dioniso_learning_feedback';

export const learningService = {
  saveFeedback: (type: 'dish' | 'drink', originalName: string, correctedData: any) => {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      const examples: FeedbackExample[] = existing ? JSON.parse(existing) : [];
      
      // Limit to last 50 examples to avoid bloat
      const newExample: FeedbackExample = {
        type,
        original: originalName,
        corrected: correctedData,
        timestamp: Date.now()
      };

      // Check if we already have an example for this original name to avoid duplicates
      const filtered = examples.filter(ex => ex.original !== originalName);
      filtered.push(newExample);
      
      const limited = filtered.slice(-50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
    } catch (e) {
      console.warn('Failed to save feedback to localStorage', e);
    }
  },

  getExamples: (type: 'dish' | 'drink', limit = 5): FeedbackExample[] => {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (!existing) return [];
      const examples: FeedbackExample[] = JSON.parse(existing);
      return examples
        .filter(ex => ex.type === type)
        .slice(-limit);
    } catch (e) {
      return [];
    }
  },

  getLearningPrompt: (type: 'dishes' | 'drinks'): string => {
    const exampleType = type === 'dishes' ? 'dish' : 'drink';
    const examples = learningService.getExamples(exampleType);
    
    if (examples.length === 0) return "";

    let prompt = `\nLEARNED EXAMPLES FROM PREVIOUS FEEDBACK (Use these as reference for formatting and level of detail):\n`;
    examples.forEach((ex, i) => {
      prompt += `${i+1}. Input: "${ex.original}" -> Output JSON: ${JSON.stringify(ex.corrected)}\n`;
    });
    prompt += `\nMaintain this standard of precision based on these verified examples.\n`;
    
    return prompt;
  }
};
