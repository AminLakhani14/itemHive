import React from 'react';
import {
    Alert,
    Autocomplete,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    InputAdornment,
    MenuItem,
    Snackbar,
    Stack,
    Tab,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    ArrowLeft,
    Award,
    BriefcaseBusiness,
    Eye,
    FileText,
    GraduationCap,
    KeyRound,
    Handshake,
    Plus,
    Save,
    ScanFace,
    StickyNote,
    Trash2,
    Upload,
    UserRound,
    Wallet,
    X,
} from 'lucide-react';
import type { AxiosError } from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../../api/axios';
import useAppCurrency from '../../hooks/useAppCurrency';
import type { RootState } from '../../store';
import { getRegionalIdLabel } from '../../lib/regional';
import { optimizeProductImage } from '../../lib/productImage';
import {
    DOCUMENT_ACCEPT,
    formatBytes,
    formatDateKey,
    getInitials,
    openEmployeeDocument,
    readEmployeeDocument,
    toLocalDateKey,
} from '../../lib/employees';
import DesignationManagerDialog from '../../components/Employees/DesignationManagerDialog';
import CreateLoginDialog from '../../components/Employees/CreateLoginDialog';
import EmployeePayrollPanel, { type EmployeePayrollSection } from '../../components/Payroll/EmployeePayrollPanel';
import { hasScreenAccess } from '../../lib/screenPermissions';
import FaceEnrollmentDialog, { type FaceEnrollmentResult } from '../../components/Attendance/FaceEnrollmentDialog';
import {
    GENDER_LABELS,
    MARITAL_STATUS_LABELS,
    NATIONALITY_OPTIONS,
    RELIGION_OPTIONS,
    SALARY_TYPE_LABELS,
    type Designation,
    type Employee,
    type EmployeeAchievement,
    type EmployeeDocumentMeta,
    type EmployeeEducation,
    type EmployeeExperience,
    type EmployeeReference,
    type EmployeeStatus,
    type Gender,
    type MaritalStatus,
    type SalaryType,
} from '../../types/employee';

type EmployeeForm = Pick<Employee,
    'fullName' | 'fatherName' | 'motherName' | 'cnic' | 'phoneNumber' | 'email' | 'address' | 'dateOfBirth' | 'joiningDate'
    | 'gender' | 'maritalStatus' | 'religion' | 'nationality' | 'emergencyContactName' | 'emergencyContactNumber' | 'medicalConditions'
    | 'designation' | 'salary' | 'salaryType' | 'status' | 'education' | 'experience' | 'references' | 'achievements' | 'notes' | 'photo'>;

interface PendingDocument {
    key: string;
    title: string;
    fileName: string;
    data: string;
    size: number;
}

interface ConfirmState {
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
}

const emptyForm: EmployeeForm = {
    fullName: '',
    fatherName: '',
    motherName: '',
    cnic: '',
    phoneNumber: '',
    email: '',
    address: '',
    dateOfBirth: '',
    joiningDate: '',
    gender: '',
    maritalStatus: '',
    religion: '',
    nationality: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
    medicalConditions: '',
    designation: '',
    salary: 0,
    salaryType: 'monthly',
    status: 'active',
    education: [],
    experience: [],
    references: [],
    achievements: [],
    notes: '',
    photo: '',
};

const blankEducation: EmployeeEducation = { degree: '', institute: '', year: '', grade: '' };
const blankExperience: EmployeeExperience = { company: '', position: '', fromDate: '', toDate: '', description: '' };
const blankReference: EmployeeReference = { name: '', relation: '', phoneNumber: '', cnic: '', address: '' };
const blankAchievement: EmployeeAchievement = { title: '', date: '', description: '' };

const toForm = (employee: Employee): EmployeeForm => ({
    fullName: employee.fullName || '',
    fatherName: employee.fatherName || '',
    motherName: employee.motherName || '',
    cnic: employee.cnic || '',
    phoneNumber: employee.phoneNumber || '',
    email: employee.email || '',
    address: employee.address || '',
    dateOfBirth: employee.dateOfBirth || '',
    joiningDate: employee.joiningDate || '',
    gender: employee.gender || '',
    maritalStatus: employee.maritalStatus || '',
    religion: employee.religion || '',
    nationality: employee.nationality || '',
    emergencyContactName: employee.emergencyContactName || '',
    emergencyContactNumber: employee.emergencyContactNumber || '',
    medicalConditions: employee.medicalConditions || '',
    designation: employee.designation || '',
    salary: Number(employee.salary || 0),
    salaryType: employee.salaryType || 'monthly',
    status: employee.status || 'active',
    education: employee.education || [],
    experience: employee.experience || [],
    references: employee.references || [],
    achievements: employee.achievements || [],
    notes: employee.notes || '',
    photo: employee.photo || '',
});

/** Rows the user added but never filled in are dropped instead of saved as blanks. */
const withoutBlankRows = <T extends object>(rows: T[]) =>
    rows
        .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? '').trim()])) as T)
        .filter((row) => Object.values(row).some(Boolean));

const getErrorMessage = (error: unknown, fallback: string) => {
    const axiosError = error as AxiosError<{ message?: string; details?: string }>;
    return axiosError.response?.data?.details || axiosError.response?.data?.message || (error instanceof Error ? error.message : '') || fallback;
};

const SectionCard: React.FC<React.PropsWithChildren<{ title: string; icon: React.ReactNode; action?: React.ReactNode }>> = ({ title, icon, action, children }) => (
    <Card sx={{ borderRadius: '8px' }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                    <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
                    <Typography variant="h6" fontWeight={800}>{title}</Typography>
                </Stack>
                {action}
            </Stack>
            {children}
        </CardContent>
    </Card>
);

interface RepeatableField<T> {
    key: keyof T & string;
    label: string;
    type?: 'text' | 'date';
    size?: number;
    multiline?: boolean;
}

interface RepeatableSectionProps<T> {
    description: string;
    addLabel: string;
    emptyText: string;
    items: T[];
    blank: T;
    fields: RepeatableField<T>[];
    onChange: (items: T[]) => void;
}

/** The row at the top of a profile tab: what the tab holds, and its main action. */
const TabToolbar: React.FC<React.PropsWithChildren<{ text: string }>> = ({ text, children }) => (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">{text}</Typography>
        {children}
    </Stack>
);

const RepeatableSection = <T extends object>({ description, addLabel, emptyText, items, blank, fields, onChange }: RepeatableSectionProps<T>) => (
    <>
        <TabToolbar text={items.length === 0 ? emptyText : description}>
            <Button size="small" startIcon={<Plus size={16} />} onClick={() => onChange([...items, { ...blank }])} sx={{ flexShrink: 0 }}>{addLabel}</Button>
        </TabToolbar>
        {items.length > 0 && (
            <Stack spacing={2}>
                {items.map((item, index) => (
                    <Box key={index} sx={{ p: 2, pr: 6, border: '1px solid', borderColor: 'divider', borderRadius: 2, position: 'relative' }}>
                        <Grid container spacing={1.5}>
                            {fields.map((field) => (
                                <Grid key={field.key} size={{ xs: 12, md: field.size ?? 6 }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label={field.label}
                                        type={field.type || 'text'}
                                        multiline={field.multiline}
                                        minRows={field.multiline ? 2 : undefined}
                                        InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
                                        value={String(item[field.key] ?? '')}
                                        onChange={(event) => onChange(items.map((current, currentIndex) => (
                                            currentIndex === index ? { ...current, [field.key]: event.target.value } : current
                                        )))}
                                    />
                                </Grid>
                            ))}
                        </Grid>
                        <Tooltip title="Remove">
                            <IconButton size="small" color="error" onClick={() => onChange(items.filter((_, currentIndex) => currentIndex !== index))} sx={{ position: 'absolute', top: 8, right: 8 }}>
                                <X size={16} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                ))}
            </Stack>
        )}
    </>
);

type ProfileTab = 'personal' | 'job' | 'education' | 'experience' | 'references' | 'achievements' | 'documents' | 'notes' | 'payroll' | 'loans' | 'payrollHistory';

const PROFILE_TABS: Array<{ key: ProfileTab; label: string; icon: React.ReactElement }> = [
    { key: 'personal', label: 'Personal', icon: <UserRound size={17} /> },
    { key: 'job', label: 'Job & Salary', icon: <Wallet size={17} /> },
    { key: 'payroll', label: 'Salary & Leaves', icon: <Wallet size={17} /> },
    { key: 'loans', label: 'Loans & Advances', icon: <Wallet size={17} /> },
    { key: 'payrollHistory', label: 'Payroll History', icon: <FileText size={17} /> },
    { key: 'education', label: 'Education', icon: <GraduationCap size={17} /> },
    { key: 'experience', label: 'Experience', icon: <BriefcaseBusiness size={17} /> },
    { key: 'references', label: 'References', icon: <Handshake size={17} /> },
    { key: 'achievements', label: 'Achievements', icon: <Award size={17} /> },
    { key: 'documents', label: 'Documents', icon: <FileText size={17} /> },
    { key: 'notes', label: 'Notes', icon: <StickyNote size={17} /> },
];

interface EmployeeProfilePageProps {
    employeeId?: string;
    embedded?: boolean;
    onManageTeam?: () => void;
    onBusyChange?: (busy: boolean) => void;
}

const EmployeeProfilePage: React.FC<EmployeeProfilePageProps> = ({ employeeId, embedded = false, onManageTeam, onBusyChange }) => {
    const { id: routeId = 'new' } = useParams();
    const id = employeeId || routeId;
    const isNew = id === 'new';
    const context = React.useRef(0);
    const [workspaceVersion, setWorkspaceVersion] = React.useState(0);
    React.useEffect(() => {
        context.current++;
        const changed = () => {
            context.current++;
            setEmployee(null); setForm({ ...emptyForm, joiningDate: toLocalDateKey() }); setDocuments([]);
            setPendingDocuments([]); setPendingFace(null); setConfirm(null); setFaceDialogOpen(false);
            setLoginDialogOpen(false); setDesignationsOpen(false); setError(''); setSuccessMessage('');
            setSaving(false); setBusy(false); setTab('personal'); setDocumentTitle(''); createdIdRef.current = '';
            setLoading(!isNew); setWorkspaceVersion(v => v + 1);
        };
        window.addEventListener('itemhive-workspace-changed', changed);
        return () => { context.current++; window.removeEventListener('itemhive-workspace-changed', changed); };
    }, [id, isNew]);
    React.useEffect(() => {
        const changed = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== id) return;
            const current = context.current;
            api.get<Employee>(`/employees/${id}`).then(({ data }) => { if (current !== context.current) return; setEmployee(data); setForm(current => ({ ...current, salary: data.salary, salaryType: data.salaryType })); }).catch(() => {});
        };
        window.addEventListener('itemhive-payroll-profile-updated', changed);
        return () => window.removeEventListener('itemhive-payroll-profile-updated', changed);
    }, [id]);
    const navigate = useNavigate();
    const { currencySymbol } = useAppCurrency();
    const { country } = useSelector((state: RootState) => state.settings);
    const regionalIdLabel = getRegionalIdLabel(country);
    const currentUser = useSelector((state: RootState) => state.auth.user);
    // Logins are Team accounts, so creating one needs the same access as the Team screen.
    const canManageTeam = (currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && hasScreenAccess(currentUser, 'team');

    const [employee, setEmployee] = React.useState<Employee | null>(null);
    const [form, setForm] = React.useState<EmployeeForm>(emptyForm);
    const [designations, setDesignations] = React.useState<Designation[]>([]);
    const [documents, setDocuments] = React.useState<EmployeeDocumentMeta[]>([]);
    const [pendingDocuments, setPendingDocuments] = React.useState<PendingDocument[]>([]);
    const [pendingFace, setPendingFace] = React.useState<FaceEnrollmentResult | null>(null);
    const [documentTitle, setDocumentTitle] = React.useState('');
    const [faceDialogOpen, setFaceDialogOpen] = React.useState(false);
    const [designationsOpen, setDesignationsOpen] = React.useState(false);
    const [confirm, setConfirm] = React.useState<ConfirmState | null>(null);
    const [loginDialogOpen, setLoginDialogOpen] = React.useState(false);
    const [tab, setTab] = React.useState<ProfileTab>('personal');
    const [payrollSection, setPayrollSection] = React.useState<EmployeePayrollSection>('salary');
    const [loading, setLoading] = React.useState(!isNew);
    const [notFound, setNotFound] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    React.useEffect(() => {
        onBusyChange?.(saving || busy);
        return () => onBusyChange?.(false);
    }, [saving, busy, onBusyChange]);
    const [error, setError] = React.useState('');
    const [successMessage, setSuccessMessage] = React.useState('');
    /** Set when a new profile is saved, so opening its URL refreshes quietly instead of showing a loader. */
    const createdIdRef = React.useRef('');

    React.useEffect(() => {
        const current = context.current;
        api.get('/employees/designations')
            .then((response) => { if (current === context.current) setDesignations(response.data || []); })
            .catch(() => { if (current === context.current) setDesignations([]); });
    }, [workspaceVersion]);

    React.useEffect(() => {
        if (isNew) {
            setEmployee(null);
            setForm({ ...emptyForm, joiningDate: toLocalDateKey() });
            setDocuments([]);
            setLoading(false);
            return;
        }

        const current = context.current;
        let cancelled = false;
        if (createdIdRef.current !== id) setLoading(true);
        setNotFound(false);
        api.get(`/employees/${id}`)
            .then((response) => {
                if (cancelled || current !== context.current) return;
                setEmployee(response.data);
                setForm(toForm(response.data));
                setDocuments(response.data.documents || []);
            })
            .catch((fetchError: unknown) => {
                if (cancelled || current !== context.current) return;
                if ((fetchError as AxiosError).response?.status === 404) setNotFound(true);
                else setError(getErrorMessage(fetchError, 'Unable to load employee profile.'));
            })
            .finally(() => { if (!cancelled && current === context.current) setLoading(false); });

        return () => { cancelled = true; };
    }, [id, isNew, workspaceVersion]);

    const designationOptions = React.useMemo(() => {
        const names = designations.map((designation) => designation.name);
        // Keep a designation that was removed from the list selectable for employees who still have it.
        return form.designation && !names.includes(form.designation) ? [...names, form.designation] : names;
    }, [designations, form.designation]);

    const updateField = <K extends keyof EmployeeForm>(field: K, value: EmployeeForm[K]) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const handlePhoto = (file?: File) => {
        if (!file) return;
        const current = context.current;
        optimizeProductImage(file)
            .then((photo) => { if (current === context.current) updateField('photo', photo); })
            .catch((photoError: unknown) => { if (current === context.current) setError(getErrorMessage(photoError, 'Unable to use this photo.')); });
    };

    const handleLoginCreated = async () => {
        const current = context.current;
        setLoginDialogOpen(false);
        setSuccessMessage('Login created. Set their rights in Team.');
        try {
            // Refresh only the saved record so unsaved edits in the form are kept.
            const response = await api.get(`/employees/${id}`);
            if (current !== context.current) return;
            setEmployee(response.data);
        } catch {
            // The login exists either way; the card updates on the next visit.
        }
    };

    const handleFaceCaptured = (result: FaceEnrollmentResult) => {
        setPendingFace(result);
        if (!form.photo && result.photo) updateField('photo', result.photo);
        setFaceDialogOpen(false);
    };

    const handleDocumentFile = async (file?: File) => {
        const current = context.current;
        if (!file) return;
        setError('');
        const title = documentTitle.trim() || file.name.replace(/\.[^.]+$/, '');
        try {
            const data = await readEmployeeDocument(file);
            if (current !== context.current) return;
            if (isNew) {
                setPendingDocuments((current) => [...current, { key: `${Date.now()}-${file.name}`, title, fileName: file.name, data, size: file.size }]);
            } else {
                setBusy(true);
                const response = await api.post(`/employees/${id}/documents`, { title, fileName: file.name, data });
                if (current !== context.current) return;
                setDocuments((current) => [response.data, ...current]);
                setSuccessMessage('Document uploaded.');
            }
            setDocumentTitle('');
        } catch (uploadError: unknown) {
            if (current !== context.current) return;
            setError(getErrorMessage(uploadError, 'Unable to upload document.'));
        } finally {
            if (current === context.current) setBusy(false);
        }
    };

    const handleViewDocument = async (document: EmployeeDocumentMeta) => {
        const current = context.current;
        setBusy(true);
        try {
            const response = await api.get(`/employees/${id}/documents/${document._id}`);
            if (current !== context.current) return;
            await openEmployeeDocument(response.data);
        } catch (viewError: unknown) {
            if (current !== context.current) return;
            setError(getErrorMessage(viewError, 'Unable to open document.'));
        } finally {
            if (current === context.current) setBusy(false);
        }
    };

    const confirmDeleteDocument = (document: EmployeeDocumentMeta) => setConfirm({
        title: 'Delete Document',
        message: `Delete "${document.title}"? This cannot be undone.`,
        onConfirm: async () => {
            const current = context.current;
            await api.delete(`/employees/${id}/documents/${document._id}`);
            if (current !== context.current) return;
            setDocuments((current) => current.filter((item) => item._id !== document._id));
            setSuccessMessage('Document deleted.');
        },
    });

    const confirmRemoveFace = () => setConfirm({
        title: 'Remove Face',
        message: `Remove the registered face for ${form.fullName}? They will not be able to mark attendance until a face is registered again.`,
        onConfirm: async () => {
            const current = context.current;
            const response = await api.delete(`/employees/${id}/face`);
            if (current !== context.current) return;
            setEmployee(response.data);
            setSuccessMessage('Face removed.');
        },
    });

    const runConfirm = async () => {
        const current = context.current;
        if (!confirm) return;
        setBusy(true);
        setError('');
        try {
            await confirm.onConfirm();
            if (current !== context.current) return;
            setConfirm(null);
        } catch (confirmError: unknown) {
            if (current !== context.current) return;
            setError(getErrorMessage(confirmError, 'Something went wrong. Please try again.'));
            setConfirm(null);
        } finally {
            if (current === context.current) setBusy(false);
        }
    };

    /** The first problem and the tab that holds the field, so the user is taken to it. */
    const validateForm = (): { message: string; tab: ProfileTab } | null => {
        if (form.fullName.trim().length < 2) return { message: 'Employee name is required.', tab: 'personal' };
        if (form.cnic.trim() && form.cnic.trim().length < 5) return { message: `Enter a valid ${regionalIdLabel}.`, tab: 'personal' };
        if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return { message: 'Enter a valid email address.', tab: 'personal' };
        if (!Number.isFinite(Number(form.salary)) || Number(form.salary) < 0) return { message: 'Salary cannot be negative.', tab: 'job' };
        return null;
    };

    const handleSave = async () => {
        const validationError = validateForm();
        if (validationError) {
            setError(validationError.message);
            setTab(validationError.tab);
            return;
        }

        const current = context.current;
        setSaving(true);
        setError('');
        const payload = {
            ...form,
            fullName: form.fullName.trim(),
            fatherName: form.fatherName.trim(),
            motherName: form.motherName.trim(),
            cnic: form.cnic.trim(),
            phoneNumber: form.phoneNumber.trim(),
            email: form.email.trim(),
            address: form.address.trim(),
            religion: form.religion.trim(),
            nationality: form.nationality.trim(),
            emergencyContactName: form.emergencyContactName.trim(),
            emergencyContactNumber: form.emergencyContactNumber.trim(),
            medicalConditions: form.medicalConditions.trim(),
            notes: form.notes.trim(),
            salary: employee?.payrollEnrolled ? undefined : Number(form.salary || 0),
            salaryType: employee?.payrollEnrolled ? undefined : form.salaryType,
            education: withoutBlankRows(form.education),
            experience: withoutBlankRows(form.experience),
            references: withoutBlankRows(form.references),
            achievements: withoutBlankRows(form.achievements),
        };

        let saved: Employee;
        try {
            const response = isNew ? await api.post('/employees', payload) : await api.put(`/employees/${id}`, payload);
            if (current !== context.current) return;
            saved = response.data;
        } catch (saveError: unknown) {
            if (current !== context.current) return;
            setError(getErrorMessage(saveError, 'Unable to save employee.'));
            setSaving(false);
            return;
        }

        // The profile is saved at this point; face and file problems are reported without losing it.
        const problems: string[] = [];
        if (pendingFace) {
            try {
                saved = (await api.put(`/employees/${saved._id}/face`, { descriptors: pendingFace.descriptors })).data;
                if (current !== context.current) return;
                setPendingFace(null);
            } catch (faceError: unknown) {
                problems.push(`Face was not registered: ${getErrorMessage(faceError, 'please try again.')}`);
            }
        }

        if (current !== context.current) return;
        const failedDocuments: PendingDocument[] = [];
        for (const document of pendingDocuments) {
            if (current !== context.current) return;
            try {
                await api.post(`/employees/${saved._id}/documents`, { title: document.title, fileName: document.fileName, data: document.data });
            } catch (documentError: unknown) {
                failedDocuments.push(document);
                problems.push(`${document.title} was not uploaded: ${getErrorMessage(documentError, 'please try again.')}`);
            }
        }
        if (current !== context.current) return;
        setPendingDocuments(failedDocuments);

        setEmployee(saved);
        setSaving(false);
        if (problems.length) setError(problems.join(' '));
        setSuccessMessage(isNew ? 'Employee created.' : 'Profile saved.');
        if (isNew) {
            createdIdRef.current = saved._id;
            navigate(`/employees/${saved._id}`, { replace: true });
        }
    };

    if (loading) {
        return <Typography color="text.secondary" sx={{ py: 8, textAlign: 'center' }}>Loading employee profile...</Typography>;
    }

    if (notFound) {
        return (
            <Box sx={{ py: 8, textAlign: 'center' }}>
                <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Employee not found</Typography>
                {!embedded && <Button variant="contained" startIcon={<ArrowLeft size={18} />} onClick={() => navigate('/employees')}>Back to Employees</Button>}
            </Box>
        );
    }

    const faceRegistered = Boolean(employee?.hasFace);
    const tabCounts: Partial<Record<ProfileTab, number>> = {
        education: form.education.length,
        experience: form.experience.length,
        references: form.references.length,
        achievements: form.achievements.length,
        documents: documents.length + pendingDocuments.length,
    };

    return (
        <Box>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    {!embedded && <IconButton onClick={() => navigate('/employees')} sx={{ border: '1px solid', borderColor: 'divider' }}>
                        <ArrowLeft size={20} />
                    </IconButton>}
                    <Box>
                        <Typography variant={embedded ? 'h6' : 'h4'} fontWeight={800}>{isNew ? 'New Employee' : 'Employee Profile'}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {isNew ? 'Create the profile and register the face used for attendance.' : `${employee?.employeeCode} · ${form.fullName}`}
                        </Typography>
                    </Box>
                </Stack>
                {(isNew || !['payroll', 'loans', 'payrollHistory'].includes(tab)) && <Button variant="contained" startIcon={<Save size={18} />} onClick={handleSave} disabled={saving || busy} sx={{ fontWeight: 800, borderRadius: '8px' }}>
                    {saving ? 'Saving...' : isNew ? 'Create Employee' : 'Save Changes'}
                </Button>}
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={3}>
                {/* The tabs need about 1,100px; on wide screens the side column gives up a column so they fit. */}
                <Grid size={{ xs: 12, lg: 4, xl: 3 }}>
                    <Stack spacing={3} sx={{ position: { lg: 'sticky' }, top: { lg: 96 } }}>
                        <Card sx={{ borderRadius: '8px' }}>
                            <CardContent sx={{ p: 3, textAlign: 'center' }}>
                                <Avatar src={form.photo || undefined} sx={{ width: 112, height: 112, mx: 'auto', mb: 2, fontSize: 36, fontWeight: 800, bgcolor: 'primary.main' }}>
                                    {getInitials(form.fullName) || <UserRound size={40} />}
                                </Avatar>
                                <Typography variant="h6" fontWeight={800}>{form.fullName || 'New employee'}</Typography>
                                <Typography variant="body2" color="text.secondary">{form.designation || 'No designation'}</Typography>
                                <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1.5 }}>
                                    {employee && <Chip size="small" label={employee.employeeCode} />}
                                    <Chip size="small" color={form.status === 'active' ? 'success' : 'default'} label={form.status === 'active' ? 'Active' : 'Inactive'} />
                                </Stack>
                                <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }}>
                                    <Button component="label" size="small" variant="outlined" startIcon={<Upload size={16} />}>
                                        {form.photo ? 'Change Photo' : 'Upload Photo'}
                                        <input type="file" accept="image/*" hidden onChange={(event) => { handlePhoto(event.target.files?.[0]); event.target.value = ''; }} />
                                    </Button>
                                    {form.photo && (
                                        <Button size="small" color="error" onClick={() => updateField('photo', '')}>Remove</Button>
                                    )}
                                </Stack>
                            </CardContent>
                        </Card>

                        <SectionCard title="Face Recognition" icon={<ScanFace size={20} />}>
                            {pendingFace ? (
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    New face captured. It will be registered when you {isNew ? 'create the employee' : 'save changes'}.
                                </Alert>
                            ) : faceRegistered ? (
                                <Alert severity="success" sx={{ mb: 2 }}>
                                    Face registered{employee?.faceRegisteredAt ? ` on ${new Date(employee.faceRegisteredAt).toLocaleDateString()}` : ''}. This employee can mark attendance.
                                </Alert>
                            ) : (
                                <Alert severity="warning" sx={{ mb: 2 }}>
                                    No face registered. Register the face so this employee can check in and out at the attendance scanner.
                                </Alert>
                            )}
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Button variant="contained" startIcon={<ScanFace size={18} />} onClick={() => setFaceDialogOpen(true)} disabled={saving}>
                                    {faceRegistered || pendingFace ? 'Re-register Face' : 'Register Face'}
                                </Button>
                                {pendingFace && (
                                    <Button color="inherit" onClick={() => setPendingFace(null)}>Discard</Button>
                                )}
                                {!pendingFace && faceRegistered && (
                                    <Button color="error" onClick={confirmRemoveFace} disabled={busy}>Remove</Button>
                                )}
                            </Stack>
                        </SectionCard>

                        <SectionCard title="Login & Access" icon={<KeyRound size={20} />}>
                            {isNew ? (
                                <Typography variant="body2" color="text.secondary">
                                    Create the employee first. You can then give them a login to sign in to ItemHive.
                                </Typography>
                            ) : employee?.account ? (
                                <Stack spacing={1.5}>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">Signs in as</Typography>
                                        <Typography fontWeight={800} sx={{ wordBreak: 'break-all' }}>{employee.account.email}</Typography>
                                    </Box>
                                    <Stack direction="row" spacing={1}>
                                        <Chip size="small" label={employee.account.role === 'admin' ? 'Admin' : employee.account.role === 'super_admin' ? 'Super Admin' : 'User'} />
                                        <Chip size="small" color={employee.account.isActive ? 'success' : 'default'} label={employee.account.isActive ? 'Login active' : 'Login disabled'} />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">
                                        Active status and rights such as installments and discounts are managed in Team.
                                    </Typography>
                                    {canManageTeam && (
                                        <Button variant="outlined" onClick={() => embedded ? onManageTeam?.() : navigate('/team')} sx={{ alignSelf: 'flex-start' }}>{embedded ? 'Account Settings' : 'Manage in Team'}</Button>
                                    )}
                                </Stack>
                            ) : (
                                <Stack spacing={1.5}>
                                    <Typography variant="body2" color="text.secondary">
                                        {canManageTeam
                                            ? 'No login yet. Create one so this employee can sign in; they will then appear in Team for rights.'
                                            : 'No login yet. An admin with Team access can create one.'}
                                    </Typography>
                                    {canManageTeam && (
                                        <Button variant="contained" startIcon={<KeyRound size={18} />} onClick={() => setLoginDialogOpen(true)} sx={{ alignSelf: 'flex-start' }}>
                                            Create Login
                                        </Button>
                                    )}
                                </Stack>
                            )}
                        </SectionCard>
                    </Stack>
                </Grid>

                <Grid size={{ xs: 12, lg: 8, xl: 9 }}>
                    <Card sx={{ borderRadius: '8px' }}>
                        <Box sx={{ px: { xs: 1, sm: 2 }, borderBottom: '1px solid', borderColor: 'divider' }}>
                            <Tabs value={tab} onChange={(_, value: ProfileTab) => setTab(value)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
                                {PROFILE_TABS.map(({ key, label, icon }) => (
                                    <Tab
                                        key={key}
                                        value={key}
                                        icon={icon}
                                        iconPosition="start"
                                        label={tabCounts[key] ? `${label} (${tabCounts[key]})` : label}
                                        sx={{ fontWeight: 800, minHeight: 58, minWidth: 0, px: 1.5 }}
                                    />
                                ))}
                            </Tabs>
                        </Box>
                        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                            {['payroll', 'loans', 'payrollHistory'].includes(tab) && (isNew ? <Alert severity="info">Save the employee profile before configuring payroll.</Alert> : <EmployeePayrollPanel employeeId={id} view={tab === 'loans' ? 'loans' : tab === 'payrollHistory' ? 'history' : 'profile'} section={payrollSection} onSectionChange={setPayrollSection} />)}
                            {tab === 'personal' && (
                                <Stack spacing={3}>
                                    <Grid container spacing={2}>
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <TextField fullWidth required label="Full Name" value={form.fullName} onChange={(event) => updateField('fullName', event.target.value)} />
                                        </Grid>
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <TextField fullWidth label={regionalIdLabel} value={form.cnic} onChange={(event) => updateField('cnic', event.target.value)} />
                                        </Grid>
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <TextField fullWidth label="Father Name" value={form.fatherName} onChange={(event) => updateField('fatherName', event.target.value)} />
                                        </Grid>
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <TextField fullWidth label="Mother Name" value={form.motherName} onChange={(event) => updateField('motherName', event.target.value)} />
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                            <TextField select fullWidth label="Gender" value={form.gender} onChange={(event) => updateField('gender', event.target.value as Gender)}>
                                                <MenuItem value=""><em>Not specified</em></MenuItem>
                                                {Object.entries(GENDER_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                                            </TextField>
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                            <TextField select fullWidth label="Marital Status" value={form.maritalStatus} onChange={(event) => updateField('maritalStatus', event.target.value as MaritalStatus)}>
                                                <MenuItem value=""><em>Not specified</em></MenuItem>
                                                {Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                                            </TextField>
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                            <TextField fullWidth type="date" label="Date of Birth" InputLabelProps={{ shrink: true }} value={form.dateOfBirth} onChange={(event) => updateField('dateOfBirth', event.target.value)} />
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                            <TextField fullWidth type="date" label="Joining Date" InputLabelProps={{ shrink: true }} value={form.joiningDate} onChange={(event) => updateField('joiningDate', event.target.value)} />
                                        </Grid>
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            {/* Suggestions with free typing, since not every answer is in a short list. */}
                                            <Autocomplete
                                                freeSolo
                                                options={RELIGION_OPTIONS}
                                                inputValue={form.religion}
                                                onInputChange={(_, value) => updateField('religion', value)}
                                                renderInput={(params) => <TextField {...params} label="Religion" />}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <Autocomplete
                                                freeSolo
                                                options={NATIONALITY_OPTIONS}
                                                inputValue={form.nationality}
                                                onInputChange={(_, value) => updateField('nationality', value)}
                                                renderInput={(params) => <TextField {...params} label="Nationality" />}
                                            />
                                        </Grid>
                                    </Grid>

                                    <Box>
                                        <Typography variant="overline" color="text.secondary" fontWeight={900}>Contact</Typography>
                                        <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <TextField fullWidth label="Phone Number" value={form.phoneNumber} onChange={(event) => updateField('phoneNumber', event.target.value)} />
                                            </Grid>
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <TextField fullWidth label="Email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
                                            </Grid>
                                            <Grid size={12}>
                                                <TextField fullWidth label="Address" value={form.address} onChange={(event) => updateField('address', event.target.value)} />
                                            </Grid>
                                        </Grid>
                                    </Box>

                                    <Box>
                                        <Typography variant="overline" color="text.secondary" fontWeight={900}>Emergency & Medical</Typography>
                                        <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <TextField fullWidth label="Emergency Contact Name" placeholder="e.g. Ahmed (brother)" value={form.emergencyContactName} onChange={(event) => updateField('emergencyContactName', event.target.value)} />
                                            </Grid>
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <TextField fullWidth label="Emergency Contact Number" value={form.emergencyContactNumber} onChange={(event) => updateField('emergencyContactNumber', event.target.value)} />
                                            </Grid>
                                            <Grid size={12}>
                                                <TextField
                                                    fullWidth
                                                    multiline
                                                    minRows={2}
                                                    label="Medical Conditions"
                                                    placeholder="Allergies, chronic conditions, or anything staff should know in an emergency"
                                                    value={form.medicalConditions}
                                                    onChange={(event) => updateField('medicalConditions', event.target.value)}
                                                />
                                            </Grid>
                                        </Grid>
                                    </Box>
                                </Stack>
                            )}

                            {tab === 'job' && (
                                <>
                                    <TabToolbar text="Designation, pay, and employment status. The joining date is on the Personal tab.">
                                        <Button size="small" startIcon={<BriefcaseBusiness size={16} />} onClick={() => setDesignationsOpen(true)} sx={{ flexShrink: 0 }}>Designations</Button>
                                    </TabToolbar>
                                    <Grid container spacing={2}>
                                        <Grid size={12}>
                                            <TextField select fullWidth label="Designation" value={form.designation} onChange={(event) => updateField('designation', event.target.value)}>
                                                <MenuItem value=""><em>No designation</em></MenuItem>
                                                {designationOptions.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                                            </TextField>
                                        </Grid>
                                        <Grid size={{ xs: 12, md: 4 }}>
                                            <TextField
                                                fullWidth
                                                type="number"
                                                label="Salary"
                                                disabled={employee?.payrollEnrolled}
                                                value={form.salary}
                                                onChange={(event) => updateField('salary', Number(event.target.value))}
                                                InputProps={{ startAdornment: <InputAdornment position="start">{currencySymbol}</InputAdornment> }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 12, md: 4 }}>
                                            <TextField select fullWidth label="Salary Type" disabled={employee?.payrollEnrolled} value={form.salaryType} onChange={(event) => updateField('salaryType', event.target.value as SalaryType)}>
                                                {Object.entries(SALARY_TYPE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                                            </TextField>
                                        </Grid>
                                        <Grid size={{ xs: 12, md: 4 }}>
                                            <TextField select fullWidth label="Status" value={form.status} onChange={(event) => updateField('status', event.target.value as EmployeeStatus)}>
                                                <MenuItem value="active">Active</MenuItem>
                                                <MenuItem value="inactive">Inactive</MenuItem>
                                            </TextField>
                                        </Grid>
                                    </Grid>
                                </>
                            )}

                            {tab === 'education' && (
                                <RepeatableSection
                                    description="Degrees and certificates."
                                    addLabel="Add Education"
                                    emptyText="No education added."
                                    items={form.education}
                                    blank={blankEducation}
                                    onChange={(items) => updateField('education', items)}
                                    fields={[
                                        { key: 'degree', label: 'Degree / Certificate' },
                                        { key: 'institute', label: 'Institute' },
                                        { key: 'year', label: 'Passing Year' },
                                        { key: 'grade', label: 'Grade / Marks' },
                                    ]}
                                />
                            )}

                            {tab === 'experience' && (
                                <RepeatableSection
                                    description="Previous jobs."
                                    addLabel="Add Experience"
                                    emptyText="No previous work experience added."
                                    items={form.experience}
                                    blank={blankExperience}
                                    onChange={(items) => updateField('experience', items)}
                                    fields={[
                                        { key: 'company', label: 'Company' },
                                        { key: 'position', label: 'Position' },
                                        { key: 'fromDate', label: 'From', type: 'date' },
                                        { key: 'toDate', label: 'To', type: 'date' },
                                        { key: 'description', label: 'Responsibilities', size: 12, multiline: true },
                                    ]}
                                />
                            )}

                            {tab === 'references' && (
                                <RepeatableSection
                                    description="People who can vouch for this employee."
                                    addLabel="Add Reference"
                                    emptyText="No references added."
                                    items={form.references}
                                    blank={blankReference}
                                    onChange={(items) => updateField('references', items)}
                                    fields={[
                                        { key: 'name', label: 'Name' },
                                        { key: 'relation', label: 'Relation' },
                                        { key: 'phoneNumber', label: 'Phone Number' },
                                        { key: 'cnic', label: regionalIdLabel },
                                        { key: 'address', label: 'Address', size: 12 },
                                    ]}
                                />
                            )}

                            {tab === 'achievements' && (
                                <RepeatableSection
                                    description="Awards and recognition."
                                    addLabel="Add Achievement"
                                    emptyText="No achievements added."
                                    items={form.achievements}
                                    blank={blankAchievement}
                                    onChange={(items) => updateField('achievements', items)}
                                    fields={[
                                        { key: 'title', label: 'Achievement' },
                                        { key: 'date', label: 'Date', type: 'date' },
                                        { key: 'description', label: 'Details', size: 12, multiline: true },
                                    ]}
                                />
                            )}

                            {tab === 'documents' && (
                                <>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="Document title"
                                            placeholder={`e.g. ${regionalIdLabel} copy, CV, Degree`}
                                            value={documentTitle}
                                            onChange={(event) => setDocumentTitle(event.target.value)}
                                        />
                                        <Button component="label" variant="outlined" startIcon={<Upload size={16} />} disabled={busy || saving} sx={{ flexShrink: 0 }}>
                                            Choose File
                                            <input type="file" hidden accept={DOCUMENT_ACCEPT} onChange={(event) => { handleDocumentFile(event.target.files?.[0]); event.target.value = ''; }} />
                                        </Button>
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                        PDF, image, Word, Excel, text, or CSV files up to 2 MB each.
                                    </Typography>

                                    {documents.length === 0 && pendingDocuments.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary">No documents uploaded.</Typography>
                                    ) : (
                                        <Stack spacing={1}>
                                            {pendingDocuments.map((document) => (
                                                <Stack key={document.key} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
                                                    <FileText size={20} />
                                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                                        <Typography fontWeight={700} noWrap>{document.title}</Typography>
                                                        <Typography variant="caption" color="text.secondary" noWrap>{document.fileName} · {formatBytes(document.size)}</Typography>
                                                    </Box>
                                                    <Chip size="small" color="info" label="Uploads on save" />
                                                    <IconButton size="small" color="error" onClick={() => setPendingDocuments((current) => current.filter((item) => item.key !== document.key))}>
                                                        <X size={16} />
                                                    </IconButton>
                                                </Stack>
                                            ))}
                                            {documents.map((document) => (
                                                <Stack key={document._id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                                                    <FileText size={20} />
                                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                                        <Typography fontWeight={700} noWrap>{document.title}</Typography>
                                                        <Typography variant="caption" color="text.secondary" noWrap>
                                                            {document.fileName} · {formatBytes(document.size)} · {formatDateKey(document.createdAt.slice(0, 10))}
                                                        </Typography>
                                                    </Box>
                                                    <Tooltip title="View / download">
                                                        <IconButton size="small" color="primary" onClick={() => handleViewDocument(document)} disabled={busy}>
                                                            <Eye size={17} />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete document">
                                                        <IconButton size="small" color="error" onClick={() => confirmDeleteDocument(document)} disabled={busy}>
                                                            <Trash2 size={17} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Stack>
                                            ))}
                                        </Stack>
                                    )}
                                </>
                            )}

                            {tab === 'notes' && (
                                <TextField fullWidth multiline minRows={5} placeholder="Anything else worth recording about this employee" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} />
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <CreateLoginDialog
                employee={loginDialogOpen && employee ? { _id: employee._id, fullName: form.fullName || employee.fullName, email: employee.email, businessId: employee.businessId } : null}
                onClose={() => setLoginDialogOpen(false)}
                onCreated={handleLoginCreated}
            />

            <FaceEnrollmentDialog
                open={faceDialogOpen}
                employeeName={form.fullName}
                onClose={() => setFaceDialogOpen(false)}
                onComplete={handleFaceCaptured}
            />

            <DesignationManagerDialog
                open={designationsOpen}
                designations={designations}
                onClose={() => setDesignationsOpen(false)}
                onChange={setDesignations}
            />

            <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 800 }}>{confirm?.title}</DialogTitle>
                <DialogContent>
                    <Typography color="text.secondary">{confirm?.message}</Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="outlined" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
                    <Button variant="contained" color="error" onClick={runConfirm} disabled={busy}>Confirm</Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={Boolean(successMessage)}
                autoHideDuration={2500}
                onClose={() => setSuccessMessage('')}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert severity="success" variant="filled" onClose={() => setSuccessMessage('')}>
                    {successMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default EmployeeProfilePage;
