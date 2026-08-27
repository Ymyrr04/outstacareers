import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './styles/experimental.css'
import { initDesignPreview } from './lib/designPreview'

initDesignPreview();

createRoot(document.getElementById("root")!).render(<App />);
