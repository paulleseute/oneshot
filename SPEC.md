# Agentic Studio
Generate a short, non-verbal plan-séquence (single continuous long take) with generative AI.
The long take is split into N segments for generation, with shared keyframe images at each split point to ensure visual continuity.

## Workflow
1. Collect input
User provides a short description of the movie.

2. Create script
Write the script as a single continuous sequence, split into 3-6 segments of 6 seconds each.
Generate N+1 keyframe descriptions: one for the opening, one for each split point, and one for the ending.
Segment i uses keyframe[i] as first frame and keyframe[i+1] as last frame.
Output format:
```
{
  mainCharacterDescription: string,
  keyframes: string[],   // N+1 vivid visual descriptions
  segments: {
    script: string        // what happens in this segment
  }[]
}
```
Model: MiniMax-M2.5-highspeed

3. Create character reference
Generate a reference image of the main character.
Model: Minimax image-01

4. Generate keyframe images
Generate N+1 images from keyframe descriptions, using the character reference image.
Each image is shared between consecutive segments to ensure continuity.
Model: Minimax image-01

5. Generate video segments
Segment i uses keyframe image[i] as first frame and keyframe image[i+1] as last frame.
Model: MiniMax-Hailuo-2.3, 720p

6. Stitch segments
Concatenate all segments into the final long take.
Using ffmpeg


## Implementation
Main is index.ts. Can be triggered via cli.ts