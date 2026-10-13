import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = readFileSync(new URL('../src/lib/screenPermissions.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const module = { exports: {} };
new Function('exports', outputText)(module.exports);
const { getDigitalMenuAccess, hasInstallmentAccess, hasScreenAccess } = module.exports;
const require = createRequire(import.meta.url);

function loadComponent(path, state) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', outputText)(id => {
        if (id === 'react-redux') return { useSelector: selector => selector(state), useDispatch: () => () => {} };
        if (id === 'react-router-dom') return { useLocation: () => ({ pathname: '/digital-menus' }), useNavigate: () => () => {}, Navigate: ({ to }) => React.createElement('span', { 'data-redirect': to }) };
        if (id === '../../lib/screenPermissions') return modulePermissions;
        if (id === '../../features/theme/themeSlice') return { toggleSidebar: () => ({ type: 'toggle' }) };
        if (id === '../../lib/logoVisibility') return { useLogoPlate: () => null };
        return require(id);
    }, module, module.exports);
    return module.exports.default;
}

const modulePermissions = module.exports;

test('the actual sidebar shows Digital Menus and the protected route opens for the checked permission', () => {
    const state = { auth: { isAuthenticated: true, user: { id: 'fixture', role: 'admin', digitalMenuAccess: 'none', screenPermissions: ['digital_menus'] } }, theme: { isSidebarCollapsed: false }, themePreview: { value: null }, settings: { app: {} } };
    const Sidebar = loadComponent('../src/components/Layout/Sidebar.tsx', state);
    const ProtectedRoute = loadComponent('../src/components/Auth/ProtectedRoute.tsx', state);
    const sidebar = () => renderToStaticMarkup(React.createElement(Sidebar, { mobileOpen: false, onDrawerToggle: () => {} }));
    const route = () => renderToStaticMarkup(React.createElement(ProtectedRoute, { allowedRoles: ['admin'], requiredScreen: 'digital_menus', requireDigitalMenuAccess: true }, React.createElement('span', null, 'Menu page')));
    assert.match(sidebar(), /Digital Menus/);
    assert.match(route(), /Menu page/);
    state.auth.user.screenPermissions = [];
    assert.doesNotMatch(sidebar(), /Digital Menus/);
    assert.match(route(), /data-redirect="\/access-denied"/);
});

test('a checked Digital Menus permission opens menus even when the old Team flag is none', () => {
    const user = { role: 'admin', digitalMenuAccess: 'none', screenPermissions: ['digital_menus'] };
    assert.equal(hasScreenAccess(user, 'digital_menus'), true);
    assert.equal(getDigitalMenuAccess(user), 'pos');
});

test('removing the screen permission blocks menus, including accounts with POS menu access', () => {
    for (const digitalMenuAccess of ['none', 'menu', 'pos']) {
        const user = { role: 'admin', digitalMenuAccess, screenPermissions: [] };
        assert.equal(hasScreenAccess(user, 'digital_menus'), false);
        assert.equal(getDigitalMenuAccess(user), 'none');
    }
});

test('the Super Admin menu grant bypasses all secondary menu access levels', () => {
    for (const digitalMenuAccess of ['none', 'menu', 'pos']) {
        assert.equal(getDigitalMenuAccess({ role: 'admin', digitalMenuAccess, screenPermissions: ['digital_menus'] }), 'pos');
    }
});

test('the installment grant bypasses disabled feature and account flags in the sidebar and route', () => {
    const state = { auth: { isAuthenticated: true, user: { id: 'fixture', role: 'admin', installmentAccess: false, screenPermissions: ['installments'] } }, theme: { isSidebarCollapsed: false }, themePreview: { value: null }, settings: { app: { installmentsEnabled: false } } };
    const Sidebar = loadComponent('../src/components/Layout/Sidebar.tsx', state);
    const ProtectedRoute = loadComponent('../src/components/Auth/ProtectedRoute.tsx', state);
    const sidebar = () => renderToStaticMarkup(React.createElement(Sidebar, { mobileOpen: false, onDrawerToggle: () => {} }));
    const route = () => renderToStaticMarkup(React.createElement(ProtectedRoute, { allowedRoles: ['admin'], requiredScreen: 'installments', requireInstallmentAccess: true }, React.createElement('span', null, 'Installments page')));
    assert.equal(hasInstallmentAccess(state.auth.user, false), true);
    assert.match(sidebar(), />Installments</);
    assert.match(route(), /Installments page/);
    state.auth.user.screenPermissions = [];
    assert.doesNotMatch(sidebar(), />Installments</);
    assert.doesNotMatch(route(), /Installments page/);
    assert.equal(hasInstallmentAccess({ role: 'user', installmentAccess: false, screenPermissions: ['installments'] }, false), false);
    assert.equal(hasInstallmentAccess({ role: 'admin', installmentAccess: true }, false), false);
    assert.equal(hasInstallmentAccess({ role: 'admin', installmentAccess: true }, true), true);
});

test('legacy admins and staff retain their Team access levels; super admins retain full access', () => {
    for (const role of ['admin', 'user']) {
        for (const screenPermissions of [null, undefined]) {
            for (const digitalMenuAccess of ['none', 'menu', 'pos']) {
                assert.equal(getDigitalMenuAccess({ role, digitalMenuAccess, screenPermissions }), digitalMenuAccess);
            }
        }
    }
    assert.equal(getDigitalMenuAccess({ role: 'user', digitalMenuAccess: 'none', screenPermissions: ['digital_menus'] }), 'none');
    assert.equal(getDigitalMenuAccess({ role: 'super_admin', digitalMenuAccess: 'none', screenPermissions: [] }), 'pos');
    assert.equal(getDigitalMenuAccess(null), 'none');
    assert.equal(getDigitalMenuAccess({ role: 'admin' }), 'none');
});
