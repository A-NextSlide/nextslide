# Custom Component Quick Reference 🎯

## ⚠️ Critical Syntax Rule

### ✅ CORRECT Pattern (Always Use This!)
```javascript
function render({props, state, updateState, id, isThumbnail, containerWidth, containerHeight}) {
  var value = props.value || 'default';
  var padding = 32;
  var availableWidth = (props.width || containerWidth || 800) - padding * 2;
  var availableHeight = (props.height || containerHeight || 600) - padding * 2;
  
  return React.createElement('div', {
    style: {width: '100%', height: '100%', padding: padding + 'px'}
  }, value);
}
```

### ❌ WRONG Pattern (THIS CAUSES ERRORS!)
```javascript
// ❌ NEVER put variables in the parameter list!
function render({
  const padding = 32;  // ❌ NO!
  const availableWidth = props.width - padding * 2;  // ❌ NO!
  props
}) {}
// ^ ERROR: unexpected token ')'
```

---

## 🎮 Fun Interactive Components

### 🎡 Spinning Wheel
```javascript
{
  componentType: 'spinning_wheel',
  items: ['Team A', 'Team B', 'Team C', 'Team D'],
  title: 'Pick a Team!'
}
```

### 🧠 Memory Game
```javascript
{
  componentType: 'memory_game',
  pairs: ['💼', '📊', '💰', '📈', '🎯', '🚀'],
  title: 'Memory Challenge'
}
```

### 🎓 Quiz
```javascript
{
  componentType: 'interactive_quiz',
  question: 'What is 2+2?',
  options: ['3', '4', '5', '6'],
  correctAnswer: 1,
  explanation: '2+2 equals 4!'
}
```

### 📊 Poll
```javascript
{
  componentType: 'interactive_poll',
  question: 'Favorite color?',
  options: ['Red', 'Blue', 'Green', 'Yellow']
}
```

---

## 🎨 Full Slide Template
```json
{
  "type": "CustomComponent",
  "props": {
    "position": {"x": 80, "y": 120},
    "width": 1760,
    "height": 880,
    "componentType": "spinning_wheel",
    "items": ["Option 1", "Option 2", "Option 3"],
    "title": "Spin to Win!"
  }
}
```

---

## 💡 When to Use What

| Situation | Component |
|-----------|-----------|
| Training / Education | `interactive_quiz` |
| Random Selection | `spinning_wheel` |
| Team Building | `memory_game` |
| Audience Feedback | `interactive_poll` |
| Icebreaker | `spinning_wheel` or `memory_game` |
| Fun Break | `memory_game` |
| Decision Making | `spinning_wheel` |

---

## 🚨 Common Mistakes to Avoid

1. ❌ Don't use `const` or `let` - use `var`
2. ❌ Don't declare variables in function parameters
3. ❌ Don't forget fallback values: `props.value || 'default'`
4. ❌ Don't forget container dimensions: `containerWidth || 800`
5. ❌ Don't use template literals - use string concatenation: `padding + 'px'`

---

## ✅ Best Practices

1. ✅ Always destructure all parameters: `{props, state, updateState, id, isThumbnail, containerWidth, containerHeight}`
2. ✅ Always provide fallbacks: `props.value || 'default'`
3. ✅ Always use 100% width/height: `width: '100%', height: '100%'`
4. ✅ Always use React.createElement (no JSX)
5. ✅ Always test in thumbnail mode: check `isThumbnail` flag

