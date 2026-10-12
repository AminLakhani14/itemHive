import mongoose, { Document, Schema } from 'mongoose';
import { MENU_TEMPLATE_IDS, type MenuDesign } from '../utils/menuDesign';
import { MAX_MENU_PICTURE_LENGTH, type MenuBlock } from '../utils/menuContent';
import { parseMenuPrices, type MenuPrices } from '../utils/menuPrices';

export interface IDigitalMenu extends Document {
    name: string;
    tableName?: string;
    menuType: 'menu' | 'deal';
    sourceMenuId?: mongoose.Types.ObjectId;
    token: string;
    productIds: string[];
    productPrices?: MenuPrices;
    dealPrice?: number;
    clientRequestId?: string;
    design?: MenuDesign;
    content?: MenuBlock[];
    pageCount?: number;
    status?: 'draft';
    isActive: boolean;
    orderingEnabled: boolean;
    createdBy?: mongoose.Types.ObjectId;
    businessId?: mongoose.Types.ObjectId;
}

const DigitalMenuSchema = new Schema<IDigitalMenu>({
    clientRequestId: { type: String, maxlength: 36 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // Root menus and deals are reusable definitions. Only a QR/table record
    // needs a table name.
    tableName: { type: String, trim: true, maxlength: 50, default: '' },
    menuType: { type: String, enum: ['menu', 'deal'], default: 'menu', index: true },
    sourceMenuId: { type: Schema.Types.ObjectId, ref: 'DigitalMenu', default: null, index: true },
    token: { type: String, required: true, unique: true, index: true },
    productIds: [{ type: String, required: true, trim: true }],
    productPrices: { type: Schema.Types.Mixed, default: undefined, validate: function (this: IDigitalMenu, value: unknown) { return parseMenuPrices(value, this.productIds) !== null; } },
    dealPrice: { type: Number, min: 0 },
    content: { type: [new Schema<MenuBlock>({
        id: { type: String, required: true, match: /^[a-z0-9_-]{1,80}$/i },
        type: { type: String, enum: ['title', 'section', 'heading', 'label', 'image'], required: true },
        imageUrl: { type: String, maxlength: MAX_MENU_PICTURE_LENGTH },
        sectionImage: { type: new Schema({ url: { type: String, maxlength: 200_000, required: true }, alt: { type: String, maxlength: 160, required: true } }, { _id: false }), default: undefined },
        source: { type: new Schema({
            imageId: { type: String, required: true }, box: { type: [Number], required: true }, headingBox: { type: [Number], default: undefined },
            originalText: { type: String, maxlength: 160 }, originalProductIds: [String], originalPrices: [Number], pricePrefix: { type: String, maxlength: 8 },
            templateOnly: { type: Boolean, default: undefined },
        }, { _id: false }), default: undefined },
        headingStyle: { type: new Schema({ backgroundColor: { type: String, match: /^#[0-9a-f]{6}$/i }, color: { type: String, match: /^#[0-9a-f]{6}$/i }, align: { type: String, enum: ['left', 'center', 'right'] } }, { _id: false }), default: undefined },
        text: { type: String, trim: true, maxlength: 500 },
        fontSize: { type: Number, min: 10, max: 96, required: true },
        color: { type: String, match: /^#[0-9a-f]{6}$/i, required: true },
        align: { type: String, enum: ['left', 'center', 'right'], required: true },
        productIds: [{ type: String, required: true }],
        page: { type: Number, min: 1, max: 20, validate: Number.isInteger },
        span: { type: Number, enum: [2, 3, 6] },
    }, { _id: false })], default: undefined },
    pageCount: { type: Number, min: 1, max: 20, validate: Number.isInteger },
    status: { type: String, enum: ['draft'] },
    design: { type: new Schema<MenuDesign>({
        templateId: { type: String, enum: MENU_TEMPLATE_IDS, required: true },
        accentColor: { type: String, match: /^#[0-9a-f]{6}$/i, required: true },
        headerColor: { type: String, match: /^#[0-9a-f]{6}$/i, required: true },
        backgroundColor: { type: String, match: /^#[0-9a-f]{6}$/i, required: true },
        surfaceColor: { type: String, match: /^#[0-9a-f]{6}$/i, required: true },
        textColor: { type: String, match: /^#[0-9a-f]{6}$/i, required: true },
        layout: { type: String, enum: ['list', 'grid'], required: true },
        fontStyle: { type: String, enum: ['sans', 'serif'], required: true },
        showImages: { type: Boolean, required: true },
        showDescriptions: { type: Boolean },
        pageSize: { type: String, enum: ['a4', 'a5', 'letter'] },
        orientation: { type: String, enum: ['portrait', 'landscape'] },
        visualStyle: { type: String, enum: ['classic', 'cards', 'minimal', 'editorial'] },
        sectionColumns: { type: Number, enum: [1, 2, 3] },
        decoration: { type: String, enum: ['none', 'border', 'corners', 'dots', 'glow'] },
    }, { _id: false }), default: undefined },
    isActive: { type: Boolean, default: true },
    orderingEnabled: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
}, { timestamps: true });

DigitalMenuSchema.index({ businessId: 1, tableName: 1 });
DigitalMenuSchema.index({ businessId: 1, sourceMenuId: 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } });
export default mongoose.model<IDigitalMenu>('DigitalMenu', DigitalMenuSchema);
