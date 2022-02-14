import removeReadmeFromPath from './removeReadmeFromPath';

it('should remove readme', () => {
  expect(removeReadmeFromPath('/README')).toEqual('');
  expect(removeReadmeFromPath('/README/')).toEqual('');
  expect(removeReadmeFromPath('/README/a/b/c')).toEqual('a/b/c');
  expect(removeReadmeFromPath('/a/b/c/README')).toEqual('/a/b/c');
  expect(removeReadmeFromPath('/a/b/c/README/')).toEqual('/a/b/c');
});
