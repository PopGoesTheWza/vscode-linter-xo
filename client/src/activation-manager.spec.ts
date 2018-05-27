import 'mocha';
import {assert} from 'chai';
import * as td from 'testdouble';
import * as _ from 'lodash';
import ActivationManager, { ActivationManagerDelegate } from './activation-manager';

class MockConfiguration {
	values: {[key: string]: any} = {};

	get(key: string, defaultValue?: any) {
		return _.get(this.values, key, defaultValue);
	}
}

describe('ActivationManager', () => {
	let manager: ActivationManager;
	let delegate: ActivationManagerDelegate;
	let config: MockConfiguration;

	beforeEach(() => {
		delegate = td.object(['getDocuments', 'getConfiguration', 'activate', 'deactivate']);
		manager = new ActivationManager(delegate);
		config = new MockConfiguration();

		td.when(delegate.getConfiguration('xo', td.matchers.anything())).thenReturn(config);
	});

	describe('when not enabled', () => {
		beforeEach(() => {
			config.values.enable = false;
		});

		it('should not activate', () => {
			td.when(delegate.getDocuments()).thenReturn([{uri: {}, languageId: 'javascript'}]);

			manager.activate();

			assert.equal(td.explain(delegate.activate).callCount, 0);
		});

		it('shoule activate on when xo.enable changed', () => {
			td.when(delegate.getDocuments()).thenReturn([{uri: {}, languageId: 'javascript'}]);
			manager.activate();

			assert.equal(td.explain(delegate.activate).callCount, 0);

			config.values.enable = true;
			manager.didChangeConfiguration();

			assert.equal(td.explain(delegate.activate).callCount, 1);
		});
	});

	describe('when enabled', () => {
		beforeEach(() => {
			config.values.enable = true;
		});

		it('should activate for javascript', () => {
			td.when(delegate.getDocuments()).thenReturn([{uri: {}, languageId: 'javascript'}]);

			manager.activate();

			td.verify(delegate.activate());
		});

		it('should activate for language in xo.validate ', () => {
			config.values.validate = ['typescript'];

			td.when(delegate.getDocuments()).thenReturn([{uri: {}, languageId: 'typescript'}]);

			manager.activate();

			td.verify(delegate.activate());
		});

		it('should not activate for non default language with default validate values', () => {
			td.when(delegate.getDocuments()).thenReturn([{uri: {}, languageId: 'vue'}]);

			manager.activate();

			assert.equal(td.explain(delegate.activate).callCount, 0);
		});

		it('should not activate for language not in xo.validate', () => {
			config.values.validate = ['typescript'];

			td.when(delegate.getDocuments()).thenReturn([{uri: {}, languageId: 'javacript'}]);

			manager.activate();

			assert.equal(td.explain(delegate.activate).callCount, 0);
		});

		it('should activate when xo.validate changed', () => {
			td.when(delegate.getDocuments()).thenReturn([{uri: {}, languageId: 'vue'}]);

			manager.activate();

			assert.equal(td.explain(delegate.activate).callCount, 0);

			config.values.validate = ['vue'];

			manager.didChangeConfiguration();

			assert.equal(td.explain(delegate.activate).callCount, 1);
		});

		it('should active when new document opened', () => {
			td.when(delegate.getDocuments()).thenReturn([{uri: {}, languageId: 'vue'}]);

			manager.activate();

			assert.equal(td.explain(delegate.activate).callCount, 0);

			manager.didOpenTextDocument({uri: {}, languageId: 'javascript'} as any);

			assert.equal(td.explain(delegate.activate).callCount, 1);
		});

		it('should not activate twice', () => {
			td.when(delegate.getDocuments()).thenReturn([{uri: {}, languageId: 'javascript'}]);

			manager.activate();

			assert.equal(td.explain(delegate.activate).callCount, 1);

			manager.didChangeConfiguration();

			assert.equal(td.explain(delegate.activate).callCount, 1);

			manager.didOpenTextDocument({uri: {}, languageId: 'javascript'} as any);

			assert.equal(td.explain(delegate.activate).callCount, 1);
		});
	});
});
