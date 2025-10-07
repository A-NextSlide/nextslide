# ReactBits Troubleshooting Guide

## Quick Fixes

### Error: "Component not found in catalog"
**Cause**: `reactBitsId` is not being passed correctly

**Check**:
```javascript
// Component structure should be:
{
  type: "ReactBits",
  props: {
    reactBitsId: "aurora",  // ✅ Inside props
    ...
  }
}
```

**Fix**: Ensure `reactBitsId` is in `props` object, not at top level.

---

### Error: "Failed to fetch from GitHub"
**Cause**: Loader trying to fetch from external API

**Fix**: Loader has been updated to use local demos. Rebuild:
```bash
npm run build
```

---

### Error: "No TypeBox definition found"
**Cause**: ReactBits not registered in TypeBox registry

**Check**:
```bash
# Should see ReactBitsDefinition in registry
grep -r "ReactBitsDefinition" src/registry/components/
```

**Fix**: Ensure `/registry/components/reactbits.ts` exists and is imported.

---

### Error: "Not in registered renderers"
**Cause**: Renderer not registered

**Check**: At end of `ReactBitsRenderer.tsx`:
```typescript
import { registerRenderer } from '../utils';
registerRenderer('ReactBits', ReactBitsRenderer);
```

**Fix**: Add the registration lines at the end of the file.

---

### Component Doesn't Render
**Debug Steps**:

1. **Check Console**: Look for error messages
2. **Verify Component ID**:
   ```javascript
   console.log(component.props.reactBitsId);
   // Should print: "aurora", "blur-text", etc.
   ```
3. **Check Catalog**:
   ```javascript
   import { REACTBITS_CATALOG } from '@/integrations/reactbits/catalog';
   console.log(REACTBITS_CATALOG['aurora']); // Should exist
   ```

---

### Settings Panel Shows Wrong Props
**Cause**: Component using wrong catalog entry

**Fix**: Verify `reactBitsId` matches catalog key exactly:
- ✅ "blur-text" (correct)
- ❌ "BlurText" (wrong)
- ❌ "blurText" (wrong)

---

### Demo Component Not Animating
**Cause**: CSS animations not loading or props not passed

**Check**:
1. Verify props are being passed to demo component
2. Check browser dev tools for CSS issues
3. Ensure parent container has size (width/height)

---

### Build Errors

**TypeScript Error: "Property 'reactBitsId' does not exist"**
```bash
# Update types:
# Check /integrations/reactbits/types.ts
# Ensure ReactBitsComponentInstance has reactBitsId in props
```

**Import Error: "Cannot find module"**
```bash
# Clear cache and rebuild:
rm -rf node_modules/.vite
npm run build
```

---

## Validation Checklist

Before deploying, verify:

- [ ] ✅ Build passes (`npm run build`)
- [ ] ✅ No TypeScript errors
- [ ] ✅ ReactBits in registered renderers list
- [ ] ✅ TypeBox definition exists
- [ ] ✅ Can add components from dropdown
- [ ] ✅ Components render on slide
- [ ] ✅ Settings panel opens
- [ ] ✅ Props can be edited
- [ ] ✅ Changes update in real-time

---

## Component Structure Reference

### Correct Structure
```typescript
{
  id: "unique-id",
  type: "ReactBits",
  props: {
    reactBitsId: "aurora",           // Component identifier
    position: { x: 100, y: 100 },
    width: 400,
    height: 300,
    // Component-specific props
    colorStops: ["#5227FF", "#7cff67", "#5227FF"],
    amplitude: 1.0,
    speed: 1.0
  }
}
```

### Registry Structure
```typescript
// /registry/components/reactbits.ts
export const ReactBitsDefinition: ComponentDefinition = {
  type: 'ReactBits',
  name: 'ReactBits Component',
  category: 'advanced',
  schema: ReactBitsSchema,
  defaultProps: { ... },
  renderer: 'ReactBits',
};
```

### Renderer Registration
```typescript
// /renderers/components/ReactBitsRenderer.tsx
import { registerRenderer } from '../utils';
registerRenderer('ReactBits', ReactBitsRenderer);
```

---

## Common Issues

### Issue: Component appears but doesn't animate
**Solutions**:
1. Check if demo component exists in `DEMO_COMPONENTS` map
2. Verify props are being passed correctly
3. Check browser console for CSS errors
4. Ensure framer-motion/gsap dependencies are installed

### Issue: Dropdown shows components but they don't add
**Solutions**:
1. Check `addComponent` is being called
2. Verify `useActiveSlide` hook is working
3. Check console for errors in `handleAddComponent`
4. Ensure component structure matches schema

### Issue: Settings panel doesn't show props
**Solutions**:
1. Verify component type is 'ReactBits'
2. Check `reactBitsId` is in props
3. Ensure catalog entry has `propsSchema` defined
4. Verify `ReactBitsSettingsEditor` is imported in `ComponentSettingsEditor.tsx`

---

## Quick Debug Commands

```bash
# Check if ReactBits files exist
ls -la src/integrations/reactbits/
ls -la src/components/reactbits/
ls -la src/renderers/components/ReactBitsRenderer.tsx
ls -la src/registry/components/reactbits.ts

# Check imports
grep -r "ReactBitsButton" src/
grep -r "ReactBitsRenderer" src/
grep -r "ReactBitsDefinition" src/

# Verify build
npm run build 2>&1 | grep -i error

# Check registrations
grep -r "registerRenderer.*ReactBits" src/
grep -r "registry.register.*ReactBits" src/
```

---

## Getting Help

If issues persist:

1. **Check Documentation**:
   - `REACTBITS_INTEGRATION.md` - Technical details
   - `REACTBITS_QUICKSTART.md` - Usage guide
   - `REACTBITS_FINAL_FIX.md` - Recent fixes

2. **Console Logs**: Add debug logging:
   ```typescript
   console.log('Component:', component);
   console.log('ReactBits ID:', component.props.reactBitsId);
   console.log('Catalog Entry:', REACTBITS_CATALOG[component.props.reactBitsId]);
   ```

3. **Verify Versions**: Ensure dependencies are installed:
   ```bash
   npm list framer-motion gsap react-spring three
   ```

---

*This guide covers all known issues and their solutions.*
*Last Updated: 2025-10-02*
