import { describe, it, expect } from 'vitest';
import { buildPrompt, loadPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import { formatImageDescription } from '@/lib/generation/prompt-formatters';

describe('generation language smoke test', () => {
  it('requirements-to-outlines prompt includes en-US and th-TH language rules', () => {
    const prompt = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: 'Create an intro biology lesson',
      language: 'th-TH',
      pdfContent: 'None',
      availableImages: 'No images available',
      userProfile: '',
      researchContext: 'None',
      teacherContext: '',
      mediaGenerationPolicy: '',
    });

    expect(prompt).toBeTruthy();
    expect(prompt!.user).toContain('if en-US, all content must be in English');
    expect(prompt!.user).toContain('if th-TH, all content must be in Thai');
  });

  it('image metadata formatting uses English Size/aspect ratio for en-US and non-zh locales', () => {
    const img = { id: 'img_1', pageNumber: 2, width: 884, height: 424 } as any;

    const enText = formatImageDescription(img, 'en-US');
    const thText = formatImageDescription(img, 'th-TH');

    expect(enText).toContain('Size: 884x424');
    expect(enText).toContain('aspect ratio 2.08');

    expect(thText).toContain('Size: 884x424');
    expect(thText).toContain('aspect ratio 2.08');
    expect(thText).not.toContain('尺寸');
  });

  it('slide-content system prompt includes chart/image language constraints', () => {
    const slidePrompt = loadPrompt(PROMPT_IDS.SLIDE_CONTENT);
    expect(slidePrompt).toBeTruthy();

    const system = slidePrompt!.systemPrompt;
    expect(system).toContain('If a generated image includes visible text, labels, or annotations, the text language must match the course language exactly.');
    expect(system).toContain('`labels` and `legends` language must match the course language. Do NOT mix languages in the same chart.');
  });
});
