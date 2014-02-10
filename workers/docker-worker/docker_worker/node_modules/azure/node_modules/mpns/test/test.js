// Copyright Jeff Wilcox
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

var assert = require('assert'),
    mpns = require('../lib/mpns');

suite('mpns', function () {

    test('HttpProperties', function () {
        assert.notEqual(mpns.Properties.http, null);
        assert.deepEqual(mpns.Properties.http, ['proxy']);
    });

    test('SslProperties', function () {
        assert.notEqual(mpns.Properties.ssl, null);
        assert.deepEqual(mpns.Properties.ssl,
            [
                'pfx',
                'key',
                'passphrase',
                'cert',
                'ca',
                'ciphers',
                'rejectUnauthorized'
            ]);
    });

    test('ToastProperties', function () {
        assert.notEqual(mpns.Properties.toast, null);
        assert.deepEqual(mpns.Properties.toast,
            [
                'text1',
                'text2',
                'param'
            ]);
    });

    test('TileProperties', function () {
        assert.notEqual(mpns.Properties.tile, null);
        assert.deepEqual(mpns.Properties.tile,
            [
                'backgroundImage',
                'count',
                'title',
                'backBackgroundImage',
                'backTitle',
                'backContent',
                'id'
            ]);
    });

    test('FlipTileProperties', function () {
        assert.notEqual(mpns.Properties.flipTile, null);
        assert.deepEqual(mpns.Properties.flipTile.sort(),
            [
                'backgroundImage',
                'count',
                'title',
                'backBackgroundImage',
                'backTitle',
                'backContent',
                'id',
                'smallBackgroundImage',
                'wideBackgroundImage',
                'wideBackContent',
                'wideBackBackgroundImage'
            ].sort());
    });

    test('OfInterestProperties', function () {
        assert.notEqual(mpns.Properties.ofInterest, null);
        assert.deepEqual(mpns.Properties.ofInterest.sort(),
            [
                'payload',
                'pushType',
                'tileTemplate',

                'backgroundImage',
                'count',
                'title',
                'backBackgroundImage',
                'backTitle',
                'backContent',
                'id',
                'smallBackgroundImage',
                'wideBackgroundImage',
                'wideBackContent',
                'wideBackBackgroundImage',

                'text1',
                'text2',
                'param'
            ].sort());
    });

    test('CreateToastWithObject', function () {
        var toast = mpns.createToast({
            text1: 'Bold text:',
            text2: 'normal text',
            param: 'NewPage.xaml?item=5'
        });

        assert.deepEqual(toast.pushType, 'toast');
        assert.deepEqual(toast.notificationClass, '2');
        assert.deepEqual(toast.targetName, 'toast');
        assert.deepEqual(toast.param, 'NewPage.xaml?item=5');
        assert.deepEqual(toast.text1, 'Bold text:');
        assert.deepEqual(toast.text2, 'normal text');
    });

    test('CreateToastWithPrimitives', function () {
        var toast = mpns.createToast('Bold text:', 'normal text', 'NewPage.xaml?item=5');

        assert.deepEqual(toast.pushType, 'toast');
        assert.deepEqual(toast.notificationClass, '2');
        assert.deepEqual(toast.targetName, 'toast');
        assert.deepEqual(toast.param, 'NewPage.xaml?item=5');
        assert.deepEqual(toast.text1, 'Bold text:');
        assert.deepEqual(toast.text2, 'normal text');
    });

    test('CreateTileWithObject', function () {
        var tile = mpns.createTile({
            count: 1,
            title: 'hello',
            backTitle: 'backtitle',
            backContent: 'backcontent'
        });

        assert.deepEqual(tile.count, 1);
        assert.deepEqual(tile.title, 'hello');
        assert.deepEqual(tile.backTitle, 'backtitle');
        assert.deepEqual(tile.backContent, 'backcontent');
    });

    test('CreateFlipTileWithObjectLegacySmallBackgroundImage', function () {
        var tile = mpns.createFlipTile({
            smallbackgroundImage : 'smallBackgroundImage'
        });

        assert.deepEqual(tile.smallBackgroundImage, 'smallBackgroundImage');
    });

    test('CreateTileWithPrimitives', function () {
        var tile = mpns.createTile('', 1, 'hello', '', 'backtitle', 'backcontent');

        assert.deepEqual(tile.count, 1);
        assert.deepEqual(tile.title, 'hello');
        assert.deepEqual(tile.backTitle, 'backtitle');
        assert.deepEqual(tile.backContent, 'backcontent');
    });
});