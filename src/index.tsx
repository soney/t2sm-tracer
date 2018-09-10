import './index.css';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import registerServiceWorker from './registerServiceWorker';
import { TraceGenerator } from './TraceGenerator';
import { TraceTracker } from './TraceTracker';

ReactDOM.render(
    <div>
        {/* <TraceGenerator server='ws://localhost:8000' /> */}
        <TraceTracker server='ws://localhost:8000' />
    </div>,
    document.getElementById('root') as HTMLElement
);
registerServiceWorker();
