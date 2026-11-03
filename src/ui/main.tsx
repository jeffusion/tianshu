import {createRoot} from 'react-dom/client';
import {TaskCenter} from './App';
import {createHostBridge} from './bridge';
import './styles.css';
const bridge=createHostBridge();
createRoot(document.getElementById('root')!).render(<TaskCenter bridge={bridge}/>);
