# Stars Canvas Background Integration

## Overview
Integrated an animated starfield canvas background on the welcome screen when the extension is in expanded window mode.

## Implementation Details

### Component: `StarsCanvas`
**Location**: `/src/components/ui/stars-canvas.jsx`

A React component that renders an animated starfield using HTML5 Canvas. Features include:
- Orbital star movement
- Twinkling effect
- Customizable colors and density
- Responsive to window resize
- Performance optimized with cached gradients

### Props
- `transparent` (boolean): Background transparency - set to `false` for solid dark background
- `maxStars` (number): Total number of stars - using 800 for balanced performance
- `hue` (number): Color hue for stars - 217 for blue theme
- `brightness` (number): Overall star brightness (0-1) - 0.6 for subtle effect
- `speedMultiplier` (number): Animation speed - 0.8 for calm movement
- `twinkleIntensity` (number): How often stars twinkle - 20 for occasional twinkles
- `className` (string): Custom CSS classes - using `opacity-40` for subtle background
- `paused` (boolean): Pause animation toggle

### Integration in App.jsx

The StarsCanvas is conditionally rendered on the welcome screen:

```jsx
{isExtensionPage && (
  <StarsCanvas 
    transparent={false}
    maxStars={800}
    hue={217}
    brightness={0.6}
    speedMultiplier={0.8}
    twinkleIntensity={20}
    className="opacity-40"
  />
)}
```

**Key Design Decisions:**
1. **Only shown in extension page mode** (`isExtensionPage`) - not in popup view for cleaner UX
2. **Reduced star count** (800 vs default 1200) for better performance
3. **Low brightness** (0.6) and **40% opacity** to keep it subtle and not distract from content
4. **Slower animation** (0.8x speed) for a calming effect
5. **Fixed positioning** with `relative z-10` on content to ensure text stays above stars

### Visual Effect
- Creates a subtle, animated space/night sky background
- Stars orbit around the center with gentle twinkling
- Enhances the welcome screen without overwhelming the UI
- Maintains readability of the welcome message

## Technical Notes

### Performance Considerations
- Uses requestAnimationFrame for smooth 60fps animation
- Gradient textures are cached to avoid recalculation
- Automatically handles window resize events
- Cleans up animation frame on component unmount

### Browser Compatibility
- Uses standard HTML5 Canvas API
- Compatible with all modern browsers
- No external dependencies required

### Customization
To adjust the effect, modify the props in `App.jsx`:
- Increase `maxStars` for denser starfield (may impact performance)
- Adjust `brightness` and `opacity` for visibility
- Change `hue` to match different color schemes
- Modify `speedMultiplier` for faster/slower movement

## Future Enhancements
- Add user preference to toggle stars on/off
- Theme-aware colors (adjust hue based on user theme)
- Reduce star count on lower-end devices for better performance
- Add shooting star effects for visual interest
