import { useEffect, useState, useSyncExternalStore } from 'react';
import { Portal } from '@mui/material';
import { workflowLoading } from '../../api/workflowLoading';
import ModernLoader from './ModernLoader';

export default function WorkflowApiLoader({ initiallyLoading = false }: { initiallyLoading?: boolean }) {
    const pending = useSyncExternalStore(workflowLoading.subscribe, workflowLoading.getSnapshot);
    const [visible, setVisible] = useState(pending > 0);
    useEffect(() => {
        let timer: number | undefined;
        const unsubscribe = workflowLoading.subscribe(() => {
            window.clearTimeout(timer);
            if (workflowLoading.getSnapshot() > 0) setVisible(true);
            // Keep one overlay between a save and its follow-up refresh requests.
            else timer = window.setTimeout(() => setVisible(false), 120);
        });
        // A fast request may finish between the first render and subscription.
        if (workflowLoading.getSnapshot() === 0) timer = window.setTimeout(() => setVisible(false), 120);
        return () => { unsubscribe(); window.clearTimeout(timer); };
    }, []);
    return initiallyLoading || pending > 0 || visible ? <Portal><ModernLoader message="Loading, please wait..." /></Portal> : null;
}
