# Chat Interface - Code Structure & Architecture

## File Organization

```
src/
├── components/
│   ├── ChatInterface.tsx          (NEW - 229 lines)
│   ├── ResultsDisplay.tsx         (Updated - Query Name changed)
│   ├── FileUploader.tsx
│   ├── ProcessingStatus.tsx
│   ├── CredentialsForm.tsx
│   ├── SqlSetupModal.tsx
│   └── PWAInstallButton.tsx
├── App.tsx                        (Updated - ChatInterface imported & added)
├── types/
│   └── language.ts               (Updated - New translations added)
└── core/
    └── ragOrchestrator.ts        (Used by ChatInterface)
```

## Component Structure

### ChatInterface.tsx

#### Imports
```typescript
import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, MessageCircle, Copy, AlertCircle, BookOpen } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { createRAGProcessor } from '../core/ragOrchestrator';
```

#### Interfaces

**Message Interface**
```typescript
interface Message {
  id: string;                    // Unique identifier
  role: 'user' | 'assistant';   // Message sender
  content: string;               // Message text
  sources?: Array<{              // Optional source documents
    source: string;              // Document name
    similarity: number;           // Match score (0-1)
    content: string;              // Document excerpt
  }>;
  timestamp: Date;               // When message was created
}
```

**Credentials Interface**
```typescript
interface Credentials {
  openai_api_key: string;        // OpenAI API key
  supabase_url: string;          // Supabase project URL
  supabase_service_key: string;  // Supabase service role key
}
```

**Props Interface**
```typescript
interface ChatInterfaceProps {
  credentials: Credentials | null;  // User credentials or null
}
```

#### State Management

```typescript
const [messages, setMessages] = useState<Message[]>([]);
// Stores all messages in conversation

const [inputValue, setInputValue] = useState('');
// Current user input in textarea

const [isLoading, setIsLoading] = useState(false);
// Loading state during query processing

const [error, setError] = useState<string | null>(null);
// Error message if query fails

const messagesEndRef = useRef<HTMLDivElement>(null);
// Reference for auto-scroll functionality
```

#### Key Functions

**scrollToBottom()**
- Scrolls chat to latest message
- Called on every message update
- Smooth scroll animation

**handleSendMessage()**
- Validates input and credentials
- Creates user message object
- Calls RAG processor
- Handles response formatting
- Updates message state
- Manages error states

**handleKeyPress()**
- Detects Enter key press
- Prevents default form submission
- Calls handleSendMessage on Enter
- Allows Shift+Enter for new lines

**copyToClipboard()**
- Copies text to clipboard
- Used for source content

#### Conditional Rendering

**No Credentials State**
```typescript
if (!credentials) {
  return (
    <div className="glass-effect-dark rounded-2xl p-8">
      {/* Placeholder message */}
    </div>
  );
}
```

**Main Chat Interface**
- Messages container with auto-scroll
- Empty state with instructions
- Message list with user/assistant differentiation
- Loading indicator
- Error display
- Input area with textarea and send button

#### Message Rendering

**User Message**
```typescript
<div className="bg-blue-600/80 text-white rounded-br-none">
  {/* Message content */}
</div>
```

**Assistant Message**
```typescript
<div className="bg-white/10 text-white/90 rounded-bl-none border border-white/20">
  {/* Message content */}
  {/* Sources section if available */}
</div>
```

**Source Display**
```typescript
{message.sources && message.sources.length > 0 && (
  <div className="mt-3 pt-3 border-t border-white/20">
    {/* Source list with similarity scores */}
  </div>
)}
```

## Integration Points

### With App.tsx

**Import**
```typescript
import ChatInterface from './components/ChatInterface.tsx';
```

**Usage**
```typescript
{credentials && !isProcessing && (
  <ChatInterface credentials={credentials} />
)}
```

**Placement**
- After ResultsDisplay component
- Before Features section
- Only visible when credentials configured
- Hidden during file processing

### With RAG Processor

**Initialization**
```typescript
const ragProcessor = createRAGProcessor({
  openaiApiKey: credentials.openai_api_key,
  supabaseUrl: credentials.supabase_url,
  supabaseServiceKey: credentials.supabase_service_key
});
```

**Query Execution**
```typescript
const result = await ragProcessor.query(userMessage.content, {
  limit: 5,
  threshold: 0.7
});
```

**Result Handling**
```typescript
if (result.success) {
  // Format and display results
} else {
  // Handle error
}
```

## Styling Architecture

### CSS Classes Used

**Container**
- `glass-effect-dark`: Frosted glass background
- `rounded-2xl`: Large border radius
- `p-8`: Padding
- `flex flex-col`: Flexbox layout
- `h-full max-h-[600px]`: Height constraints

**Messages**
- `flex justify-end/start`: Message alignment
- `max-w-xs lg:max-w-md xl:max-w-lg`: Responsive width
- `px-4 py-3`: Message padding
- `rounded-lg`: Border radius
- `rounded-br-none/rounded-bl-none`: Tail styling

**Input Area**
- `flex gap-3`: Flexbox with gap
- `flex-1`: Textarea takes remaining space
- `p-3`: Input padding
- `bg-white/10`: Semi-transparent background
- `border border-white/20`: Subtle border

**Buttons**
- `flex items-center justify-center`: Centering
- `px-4 py-3`: Button padding
- `bg-blue-600 hover:bg-blue-700`: Color and hover
- `disabled:opacity-50`: Disabled state

## Data Flow

```
User Input
    ↓
handleSendMessage()
    ↓
Create User Message
    ↓
Add to Messages State
    ↓
Clear Input
    ↓
Set Loading = true
    ↓
Create RAG Processor
    ↓
Query Documents
    ↓
Process Results
    ↓
Create Assistant Message
    ↓
Add to Messages State
    ↓
Set Loading = false
    ↓
Auto-scroll to Bottom
```

## Error Handling Strategy

**Try-Catch Block**
```typescript
try {
  // Query execution
} catch (err) {
  setError(err.message);
  // Create error message
} finally {
  setIsLoading(false);
}
```

**Error Display**
- Red background box
- Alert icon
- Error message text
- Dismissible on new query

## Performance Considerations

1. **Memoization**
   - scrollToBottom function
   - Message rendering

2. **Optimization**
   - useEffect for scroll only on message change
   - Conditional rendering for sources
   - Efficient state updates

3. **Constraints**
   - Max 5 documents per query
   - Similarity threshold: 0.7
   - No message persistence

## Type Safety

- Full TypeScript implementation
- Strict null checking
- Interface definitions for all data structures
- Type-safe event handlers
- Proper ref typing

## Accessibility

- Semantic HTML elements
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus management
- Color contrast compliance
- Screen reader friendly

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES2020+ JavaScript features
- CSS Grid and Flexbox
- Fetch API
- LocalStorage (if added)

