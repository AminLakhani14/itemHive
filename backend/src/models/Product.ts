import mongoose, { Schema, Document } from 'mongoose';
import { validateSellingProduct, type SizeData } from '../utils/productSelling';
import { branchScopedPlugin } from '../utils/branchScope';

export interface IProduct extends Document {
    unitSizeEnabled?: boolean;
    sellingType?: string;
    sizes?: SizeData[];
    id: string;
    sku: string;
    name: string;
    category: string;
    purchasePrice: number;
    salePrice: number;
    price: number;
    stock: number;
    minStock: number;
    productUnitCode?: string;
    productUnit?: string;
    productUnitUrdu?: string;
    description: string;
    imageUrl?: string;
    lastUpdated: Date;
    batchNumber?: string;
    expiryDate?: string;
    supplier?: string;
    businessId?: mongoose.Types.ObjectId;
    businessName?: string;
}

const ProductSchema: Schema<IProduct> = new Schema({
    unitSizeEnabled: { type: Boolean, default: false },
    sellingType: { type: String, enum: ['', 'quantity', 'fixed'], default: '' },
    sizes: [{ id: { type: String, required: true }, size: { type: Schema.Types.Mixed, required: true }, purchasePrice: { type: Number, default: 0, min: 0 }, salePrice: { type: Number, default: 0, min: 0 }, stock: { type: Number, default: 0, min: 0 }, _id: false }],
    id: { type: String, required: true, index: true },
    sku: { type: String, required: true, index: true },
    name: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    purchasePrice: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true },
    stock: { type: Number, required: true, default: 0, min: 0 },
    minStock: { type: Number, required: true, default: 5 },
    productUnitCode: { type: String, default: function (this: IProduct) { return this.unitSizeEnabled ? undefined : 'piece'; }, trim: true },
    productUnit: { type: String, default: function (this: IProduct) { return this.unitSizeEnabled ? undefined : 'Piece'; }, trim: true },
    productUnitUrdu: { type: String, default: 'عدد', trim: true },
    description: { type: String, default: '' },
    imageUrl: {
        type: String,
        default: '',
        maxlength: [250000, 'Product image is too large.'],
        validate: {
            validator: (value: string) => !value
                || /^https?:\/\/.+/.test(value)
                || /^\/product-images\/[A-Za-z0-9/_-]+\.(png|jpe?g|webp)$/i.test(value)
                || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value),
            message: 'Product image must be a valid HTTP(S) URL, local product image path, or PNG, JPEG or WebP data URL.',
        },
    },
    lastUpdated: { type: Date, default: Date.now },
    batchNumber: { type: String, default: '' },
    expiryDate: { type: String, default: '' },
    supplier: { type: String, default: '' },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    businessName: { type: String, default: '', index: true }
}, { timestamps: true });

ProductSchema.index({ businessId: 1, branchId: 1, id: 1 }, { unique: true });
ProductSchema.index({ businessId: 1, branchId: 1, sku: 1 }, { unique: true });

// Automatically update lastUpdated before saving
ProductSchema.pre('validate', function () { validateSellingProduct(this); });
ProductSchema.pre('save', function () {
    this.price = this.salePrice;
    this.lastUpdated = new Date();
});

ProductSchema.plugin(branchScopedPlugin);
export default mongoose.model<IProduct>('Product', ProductSchema);
