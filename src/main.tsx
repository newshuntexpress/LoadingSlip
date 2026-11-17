import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {installGlobalUppercaseEnforcement} from './utils/enforceUppercase';

installGlobalUppercaseEnforcement();

createRoot(document.getElementById('root')!).render(<App />);
