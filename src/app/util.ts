import * as sha1 from 'js-sha1';
export function hashObject(type:string, body:string) {
  let header = `${ type } ${ body.length }\0`;
  return sha1(header + body);
}
