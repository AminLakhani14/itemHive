import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { USER_ROLES } from '../utils/accessControl';
import { ADMIN_SCREEN_PERMISSIONS } from '../utils/screenPermissions';
import { FACE_DESCRIPTOR_LENGTH } from '../utils/faceMatch';
import { EMPLOYEE_STATUSES, GENDERS, MARITAL_STATUSES, SALARY_TYPES } from '../models/Employee';
import { LEAVE_TYPES } from '../models/EmployeeLeave';

/**
 * Express middleware factory for validating request body against a Joi schema.
 */
export const validate = (schema: Joi.ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        });
        if (error) {
            const details = error.details.map(d => d.message).join(', ');
            return res.status(400).json({
                status: 'error',
                message: 'Validation failed',
                details,
                code: 'VALIDATION_ERROR',
            });
        }
        req.body = value;
        next();
    };
};

// --- Schemas ---

export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
});

export const registerSchema = Joi.object({
    name: Joi.string().min(2).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid(...USER_ROLES).optional(),
    businessName: Joi.string().min(2).max(120).optional(),
    businessId: Joi.string().allow('').optional(),
    packageId: Joi.string().valid('free_trial', 'starter', 'pro').optional(),
    packageName: Joi.string().min(2).max(80).optional(),
    country: Joi.string().valid('PK', 'US', 'DE', 'GB', 'CH', 'CD', 'CG', 'IN', 'AE').optional(),
    currency: Joi.string().valid('USD', 'EUR', 'GBP', 'CHF', 'CDF', 'XAF', 'PKR', 'INR', 'AED').optional(),
    businessType: Joi.string().allow('').max(120).optional(),
    phone: Joi.string().allow('').max(60).optional(),
    employeeCount: Joi.number().integer().min(1).max(100000).optional(),
    address: Joi.string().allow('').max(240).optional(),
    notes: Joi.string().allow('').max(600).optional(),
    employeeId: Joi.string().hex().length(24).optional(),
});

export const signupRequestSchema = Joi.object({
    fullName: Joi.string().min(2).max(120).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    businessName: Joi.string().min(2).max(120).required(),
    packageId: Joi.string().valid('free_trial', 'starter', 'pro').required(),
    packageName: Joi.string().min(2).max(80).required(),
    country: Joi.string().valid('PK', 'US', 'DE', 'GB', 'CH', 'CD', 'CG', 'IN', 'AE').required(),
    currency: Joi.string().valid('USD', 'EUR', 'GBP', 'CHF', 'CDF', 'XAF', 'PKR', 'INR', 'AED').required(),
    businessType: Joi.string().allow('').max(120).optional(),
    phone: Joi.string().allow('').max(60).optional(),
    employeeCount: Joi.number().integer().min(1).max(100000).required(),
    address: Joi.string().allow('').max(240).optional(),
    notes: Joi.string().allow('').max(600).optional(),
});

export const signupRequestDecisionSchema = Joi.object({
    status: Joi.string().valid('approved', 'rejected').required(),
    decisionNote: Joi.string().allow('').max(600).optional(),
});

export const productSchema = Joi.object({
    unitSizeEnabled: Joi.boolean().optional(),
    sellingType: Joi.string().valid('quantity', 'fixed').when('unitSizeEnabled', {
        is: Joi.valid(true).required(),
        then: Joi.required(),
        otherwise: Joi.allow('').optional(),
    }),
    sizes: Joi.array().items(Joi.object({
        id: Joi.string().trim().required(),
        size: Joi.alternatives().try(Joi.string().trim().min(1).max(100), Joi.number().positive()).required(),
        purchasePrice: Joi.number().min(0).empty('').default(0),
        salePrice: Joi.number().min(0).empty('').default(0),
        stock: Joi.number().integer().min(0).empty('').default(0),
    })).unique('id').unique('size').when('unitSizeEnabled', {
        is: Joi.valid(true).required(),
        then: Joi.array().when('sellingType', { is: 'fixed', then: Joi.array().min(1).required(), otherwise: Joi.optional() }),
        otherwise: Joi.optional(),
    }),
    id: Joi.string().required(),
    sku: Joi.string().required(),
    name: Joi.string().min(2).required(),
    category: Joi.string().required(),
    purchasePrice: Joi.number().min(0).required(),
    salePrice: Joi.number().min(0).required(),
    price: Joi.number().min(0).optional(),
    stock: Joi.number().min(0).required(),
    minStock: Joi.number().min(0).optional(),
    productUnitCode: Joi.string().trim().max(40).when('unitSizeEnabled', { is: Joi.valid(true).required(), then: Joi.required(), otherwise: Joi.allow('').optional() }),
    productUnit: Joi.string().trim().max(80).when('unitSizeEnabled', { is: Joi.valid(true).required(), then: Joi.required(), otherwise: Joi.allow('').optional() }),
    productUnitUrdu: Joi.string().allow('').max(80).optional(),
    description: Joi.string().allow('').optional(),
    imageUrl: Joi.alternatives().try(
        Joi.string().allow('').max(2048).pattern(/^https?:\/\/.+/),
        Joi.string().max(250_000).pattern(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
    ).optional().messages({
        'alternatives.match': 'Image must be a valid HTTP(S) URL or optimized PNG, JPEG or WebP image.',
        'string.max': 'Product image is too large. Please use an image under 180 KB after optimization.',
    }),
    batchNumber: Joi.string().allow('').optional(),
    expiryDate: Joi.string().allow('').optional(),
    supplier: Joi.string().allow('').optional(),
});

export const creditPaymentSchema = Joi.object({
    customerName: Joi.string().min(2).required(),
    customerCnic: Joi.string().min(5).required(),
    amount: Joi.number().positive().required(),
    paidVia: Joi.string().valid('cash', 'card').required(),
    notes: Joi.string().allow('').optional(),
});

export const customerSchema = Joi.object({
    fullName: Joi.string().min(2).max(120).required(),
    cnic: Joi.string().min(5).max(40).required(),
    phoneNumber: Joi.string().min(5).max(60).required(),
    amount: Joi.number().min(0).required(),
    email: Joi.string().email().allow('').max(120).optional(),
    address: Joi.string().allow('').max(240).optional(),
    city: Joi.string().allow('').max(80).optional(),
    customerType: Joi.string().valid('regular', 'credit', 'installment', 'wholesale').required(),
    status: Joi.string().valid('active', 'inactive').required(),
    notes: Joi.string().allow('').max(600).optional(),
});

export const installmentPlanSchema = Joi.object({
    salespersonEmployeeId: Joi.string().hex().length(24).optional(),
    sizeId: Joi.string().optional(),
    planCode: Joi.string().required(),
    productId: Joi.string().required(),
    productName: Joi.string().min(2).required(),
    amount: Joi.number().positive().required(),
    totalAmount: Joi.number().positive().required(),
    unitPrice: Joi.number().positive().required(),
    advancePayment: Joi.number().min(0).required(),
    customerName: Joi.string().min(2).required(),
    customerCnic: Joi.string().min(5).required(),
    customerPhone: Joi.string().min(5).required(),
    customerAddress: Joi.string().min(5).required(),
    saleDate: Joi.date().required(),
    installmentMonths: Joi.number().valid(3, 6, 9, 12).required(),
    userName: Joi.string().min(2).required(),
    shiftId: Joi.string().hex().length(24).optional(),
    orderId: Joi.string().min(1).max(120).optional(),
    advancePaidVia: Joi.string().valid('cash', 'card').optional(),
    orderType: Joi.string().trim().max(80).optional(),
    otherOrderType: Joi.string().allow('').max(80).optional(),
    witnesses: Joi.array().length(2).items(
        Joi.object({
            name: Joi.string().min(2).required(),
            cnic: Joi.string().min(5).required(),
            address: Joi.string().min(5).required(),
        })
    ).required(),
});

export const installmentPaymentSchema = Joi.object({
    installmentNumber: Joi.number().integer().positive().required(),
    paidVia: Joi.string().valid('cash', 'card').required(),
    notes: Joi.string().allow('').optional(),
});

/** Roughly 900KB of image data once base64 decoded. */
export const RECEIPT_BANNER_MAX_LENGTH = 1_200_000;

export const settingsSchema = Joi.object({
    country: Joi.string().valid('PK', 'US', 'DE', 'GB', 'CH', 'CD', 'CG', 'IN', 'AE').required(),
    currency: Joi.string().valid('USD', 'EUR', 'GBP', 'CHF', 'CDF', 'XAF', 'PKR', 'INR', 'AED').required(),
    notifications: Joi.object({
        orderUpdates: Joi.boolean().required(),
        lowStockAlerts: Joi.boolean().required(),
    }).required(),
    app: Joi.object({
        salesTaxRate: Joi.number().min(0).max(100).required(),
        shopName: Joi.string().allow('').max(120).required(),
        shopPhone: Joi.string().allow('').max(200).required(),
        shopAddress: Joi.string().allow('').max(240).required(),
        receiptBannerUrl: Joi.string()
            .allow('')
            .max(RECEIPT_BANNER_MAX_LENGTH)
            .pattern(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
            .messages({
                'string.pattern.base': 'Banner must be a PNG, JPEG or WEBP image',
                'string.max': 'Banner image is too large. Please use a smaller file.',
            })
            .optional(),
        invoiceLogoUrl: Joi.string()
            .allow('')
            .max(RECEIPT_BANNER_MAX_LENGTH)
            .pattern(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
            .messages({
                'string.pattern.base': 'Invoice logo must be a PNG, JPEG or WEBP image',
                'string.max': 'Invoice logo is too large. Please use a smaller file.',
            })
            .optional(),
        installmentsEnabled: Joi.boolean().required(),
        discountsEnabled: Joi.boolean().required(),
        discountOptions: Joi.array().items(Joi.number().greater(0).max(100)).max(20).unique().required(),
        orderTypeOptions: Joi.array().items(Joi.string().trim().min(1).max(80)).min(1).max(20).unique().optional(),
        restaurantEnabled: Joi.boolean().optional(),
        autoRegistrationEnabled: Joi.boolean().optional(),
        basicCustomizationOfferEnabled: Joi.boolean().optional(),
    }).optional(),
});

export const updateUserStatusSchema = Joi.object({
    isActive: Joi.boolean().optional(),
    isVisible: Joi.boolean().optional(),
    installmentAccess: Joi.boolean().optional(),
    discountAccess: Joi.boolean().optional(),
    digitalMenuAccess: Joi.string().valid('none', 'menu', 'pos').optional(),
    restaurantEnabled: Joi.boolean().optional(),
    businessTypeId: Joi.string().trim().max(80).allow('').optional(),
}).or('isActive', 'isVisible', 'installmentAccess', 'discountAccess', 'digitalMenuAccess', 'restaurantEnabled', 'businessTypeId');

export const updateBusinessTypeSchema = Joi.object({
    productFields: Joi.array().items(Joi.string().valid('unitSize', 'supplier', 'batchNumber', 'expiryDate')).unique().required(),
});

export const createBusinessTypeSchema = Joi.object({
    productFields: Joi.array().items(Joi.string().valid('unitSize', 'supplier', 'batchNumber', 'expiryDate')).unique().optional(),
    name: Joi.string().trim().min(2).max(80).required(),
});

export const updateMonthlyPaymentSchema = Joi.object({
    enabled: Joi.boolean().required(),
    paid: Joi.boolean().required(),
    paidAt: Joi.date().iso().optional(),
});

export const updateAdminLimitSchema = Joi.object({
    userCreationLimit: Joi.number().integer().min(0).required(),
});

export const updateScreenPermissionsSchema = Joi.object({
    screenPermissions: Joi.array()
        .items(Joi.string().valid(...ADMIN_SCREEN_PERMISSIONS))
        .unique()
        .required(),
});

export const updateUserAccountSchema = Joi.object({
    name: Joi.string().min(2).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).allow('').optional(),
    role: Joi.string().valid(...USER_ROLES).optional(),
    businessId: Joi.string().allow('').optional(),
});

export const updateBusinessSchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
});

export const inventoryRequestDecisionSchema = Joi.object({
    status: Joi.string().valid('approved', 'rejected').required(),
    decisionNote: Joi.string().allow('').optional(),
});

const inventoryVendorSchema = Joi.object({
        id: Joi.string().trim().max(100).required(),
        name: Joi.string().trim().max(120).required(),
        phone: Joi.string().trim().allow('').max(60).default(''),
        cnic: Joi.string().trim().allow('').pattern(/^(\d{13}|\d{5}-\d{7}-\d)$/).default('').messages({ 'string.pattern.base': 'CNIC must contain 13 digits (e.g. 12345-1234567-1).' }),
        address: Joi.string().trim().allow('').max(500).default(''),
});

export const inventoryVendorsSchema = Joi.object({
    vendors: Joi.array().max(50).unique('id').items(inventoryVendorSchema).required(),
    version: Joi.number().integer().min(0).required(),
});

export const inventoryVendorDetailsSchema = inventoryVendorSchema.fork('id', schema => schema.optional()).keys({
    version: Joi.number().integer().min(0).default(0),
    archived: Joi.boolean().default(false),
});

export const receiveInventorySchema = Joi.object({
    version: Joi.number().integer().min(0).required(),
    receivedQuantities: Joi.array().min(1).max(200).items(Joi.number().min(0).max(1e9).required()).required(),
    links: Joi.array().min(1).max(200).items(Joi.object({
        productId: Joi.string().trim().max(100).allow('').optional(),
        sizeId: Joi.string().trim().max(100).allow('').optional(),
    })).optional(),
    reference: Joi.string().trim().allow('').max(120).default(''),
    note: Joi.string().trim().allow('').max(600).default(''),
});

export const restockRequestSchema = Joi.object({
    vendors: Joi.array().min(1).max(50).unique('id').items(inventoryVendorSchema).required(),
    items: Joi.array().min(1).max(200).items(Joi.object({
        productId: Joi.string().trim().max(100).optional(),
        name: Joi.string().trim().max(200).when('productId', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
        category: Joi.string().trim().max(100).optional(),
        unit: Joi.string().trim().max(80).when('productId', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
        sizeId: Joi.string().trim().max(100).allow('').optional(),
        quantity: Joi.number().positive().max(1e9).required(),
        vendorId: Joi.string().trim().max(100).required(),
        remarks: Joi.string().trim().allow('').max(600).default(''),
    })).required(),
});

export const noteCreateSchema = Joi.object({
    title: Joi.string().allow('').optional(),
    body: Joi.string().allow('').optional(),
    color: Joi.string().allow('').optional(),
    pinned: Joi.boolean().optional(),
});

export const noteUpdateSchema = Joi.object({
    title: Joi.string().allow('').optional(),
    body: Joi.string().allow('').optional(),
    color: Joi.string().allow('').optional(),
    pinned: Joi.boolean().optional(),
});

// --- Employees & Attendance ---

const dateKeySchema = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ 'string.pattern.base': '{{#label}} must be a YYYY-MM-DD date' });
const optionalText = (max: number) => Joi.string().allow('').max(max).optional();
const faceDescriptorSchema = Joi.array().length(FACE_DESCRIPTOR_LENGTH).items(Joi.number().required());

/** Profile photos are optimized client-side to <= 180 KB before base64 encoding. */
export const EMPLOYEE_PHOTO_MAX_LENGTH = 300_000;
/** Base64 of a 2 MB file, which keeps each upload under the 3 MB JSON body cap. */
export const EMPLOYEE_DOCUMENT_MAX_LENGTH = 2_800_000;

export const employeeSchema = Joi.object({
    fullName: Joi.string().trim().min(2).max(120).required(),
    fatherName: optionalText(120),
    motherName: optionalText(120),
    cnic: Joi.string().trim().allow('').max(40).optional(),
    phoneNumber: optionalText(60),
    email: Joi.string().email().allow('').max(120).optional(),
    address: optionalText(240),
    dateOfBirth: dateKeySchema.allow('').optional(),
    joiningDate: dateKeySchema.allow('').optional(),
    gender: Joi.string().valid(...GENDERS.filter(Boolean)).allow('').optional(),
    maritalStatus: Joi.string().valid(...MARITAL_STATUSES.filter(Boolean)).allow('').optional(),
    religion: optionalText(60),
    nationality: optionalText(60),
    emergencyContactName: optionalText(120),
    emergencyContactNumber: optionalText(60),
    medicalConditions: optionalText(1000),
    designation: optionalText(80),
    salary: Joi.number().min(0).max(1_000_000_000).optional(),
    salaryType: Joi.string().valid(...SALARY_TYPES).optional(),
    status: Joi.string().valid(...EMPLOYEE_STATUSES).optional(),
    education: Joi.array().max(20).items(Joi.object({
        degree: optionalText(120),
        institute: optionalText(160),
        year: optionalText(20),
        grade: optionalText(40),
    })).optional(),
    experience: Joi.array().max(30).items(Joi.object({
        company: optionalText(160),
        position: optionalText(120),
        fromDate: dateKeySchema.allow('').optional(),
        toDate: dateKeySchema.allow('').optional(),
        description: optionalText(600),
    })).optional(),
    references: Joi.array().max(10).items(Joi.object({
        name: optionalText(120),
        relation: optionalText(80),
        phoneNumber: optionalText(60),
        cnic: optionalText(40),
        address: optionalText(240),
    })).optional(),
    achievements: Joi.array().max(30).items(Joi.object({
        title: optionalText(160),
        date: dateKeySchema.allow('').optional(),
        description: optionalText(600),
    })).optional(),
    notes: optionalText(1000),
    photo: optionalText(EMPLOYEE_PHOTO_MAX_LENGTH),
});

export const employeeFaceSchema = Joi.object({
    descriptors: Joi.array().min(1).max(10).items(faceDescriptorSchema).required(),
});

export const employeeDocumentSchema = Joi.object({
    title: Joi.string().trim().min(1).max(120).required(),
    fileName: Joi.string().trim().min(1).max(200).required(),
    data: Joi.string().pattern(/^data:[^;,]+;base64,/).max(EMPLOYEE_DOCUMENT_MAX_LENGTH).required()
        .messages({ 'string.max': 'Documents must be 2 MB or smaller' }),
});

export const designationSchema = Joi.object({
    name: Joi.string().trim().min(2).max(60).required(),
});

export const attendancePunchSchema = Joi.object({
    descriptor: faceDescriptorSchema.required(),
    photo: optionalText(60_000),
    timeZone: optionalText(64),
});

export const attendanceRecordSchema = Joi.object({
    employeeId: Joi.string().hex().length(24).required(),
    dateKey: dateKeySchema.required(),
    checkIn: Joi.date().iso().allow(null).optional(),
    checkOut: Joi.date().iso().allow(null).optional(),
    note: optionalText(300),
    timeZone: optionalText(64),
});

export const employeeLeaveSchema = Joi.object({
    employeeId: Joi.string().hex().length(24).required(),
    startDate: dateKeySchema.required(),
    endDate: dateKeySchema.required(),
    leaveType: Joi.string().valid(...LEAVE_TYPES).required(),
    reason: optionalText(300),
});

export const attendanceSettingsSchema = Joi.object({
    weeklyOffDays: Joi.array().max(6).unique().items(Joi.number().integer().min(0).max(6)).required(),
});
