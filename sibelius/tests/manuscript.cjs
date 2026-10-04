// Test interpreter for the documented subset of ManuScript used by this plugin.
// It reads the shipped .plg, including its dialogs. This is NOT Sibelius itself.
// Expressions deliberately evaluate left-to-right, as Avid documents.
'use strict';
const fs = require('node:fs');
function tokens(text, plg=false) {
    const out=[]; let i=0;
    while(i<text.length) {
        const c=text[i];
        if (/\s/.test(c)) {i++;continue;}
        if(c==='/' && text[i+1]==='/') {while(i<text.length && text[i]!=='\n')i++;continue;}
        if(c==='"'||c==="'") {
            const q=c;let s='';i++;
            while(i<text.length&&text[i]!==q) {
                if(text[i]==='\\' && plg) {i++;s+=text[i++];}
                else s+=text[i++];
            }
            if(text[i]!==q)throw Error('Unterminated string');i++;out.push({kind:'string',v:s});continue;
        }
        const number=/^\d+(?:\.\d+)?/.exec(text.slice(i));
        if(number){out.push({kind:'number',v:Number(number[0])});i+=number[0].length;continue;}
        const id=/^[A-Za-z_][A-Za-z_0-9]*/.exec(text.slice(i));
        if(id){out.push({kind:'id',v:id[0]});i+=id[0].length;continue;}
        const op=/^(?:!=|<=|>=|[{}()[\].,:;=+*/%&<>-])/.exec(text.slice(i));
        if(!op)throw Error(`Unexpected token near ${text.slice(i,i+25)}`);
        out.push({kind:'op',v:op[0]});i+=op[0].length;
    }
    out.push({kind:'eof',v:'EOF'});return out;
}
function parsePlg(file) {
    const bytes=Buffer.isBuffer(file)?file:fs.readFileSync(file);
    if(bytes[0]!==255||bytes[1]!==254)throw Error('Expected UTF-16LE .plg with BOM');
    const ts=tokens(bytes.subarray(2).toString('utf16le'),true);let i=0;
    function children() {
        if(ts[i++].v!=='{')throw Error('Expected PLG block');const nodes=[];
        while(ts[i].v!=='}') {
            let label='',data=null,sub=[];
            if(ts[i].kind==='id')label=ts[i++].v;
            if(ts[i].kind==='string')data=ts[i++].v;
            if(ts[i].v==='{')sub=children();
            if(!label&&data===null)throw Error('Invalid PLG node');
            nodes.push({label,data,children:sub});
        }
        i++;return nodes;
    }
    const nodes=children();if(ts[i].kind!=='eof')throw Error('Trailing PLG data');return nodes;
}
class Parser {
    constructor(text){this.t=tokens(text);this.i=0;}
    peek(){return this.t[this.i].kind==='string'?'[STRING]':this.t[this.i].v;}
    take(v){const t=this.t[this.i++];if(v!==undefined&&t.v!==v)throw Error(`Expected ${v}, got ${t.v}`);return t;}
    expression() {
        let left=this.unary();
        // ManuScript gives binary operators equal precedence, left-to-right.
        while(['=','!=','<','>','<=','>=','+','-','*','/','%','&','and','or'].includes(this.peek())) {
            const op=this.take().v;left={op,left,right:this.unary()};
        }
        return left;
    }
    unary() {
        if(['not','-'].includes(this.peek())){const unary=this.take().v;return{unary,value:this.unary()};}
        let value;
        if(this.peek()==='('){this.take();value=this.expression();this.take(')');}
        else {const t=this.take();value=t.kind==='id'?{name:t.v}:{literal:t.v};}
        while(['.','[','('].includes(this.peek())) {
            if(this.peek()==='.') {
                this.take();let field=this.take().v;let user=false;
                if(field==='_property'){this.take(':');field=this.take().v;user=true;}
                value={object:value,field,user};
            } else if(this.peek()==='[') {
                this.take();value={object:value,index:this.expression()};this.take(']');
            } else {
                this.take();const args=[];
                if(this.peek()!==')'){args.push(this.expression());while(this.peek()===','){this.take();args.push(this.expression());}}
                this.take(')');value={call:value,args};
            }
        }
        return value;
    }
    block(){this.take('{');const body=[];while(this.peek()!=='}')body.push(this.statement());this.take('}');return body;}
    statement() {
        if(this.peek()==='if') {
            this.take();this.take('(');const test=this.expression();this.take(')');const yes=this.block();let no=[];
            if(this.peek()==='else'){this.take();no=this.block();}return{if:test,yes,no};
        }
        if(this.peek()==='while') {
            this.take();this.take('(');const test=this.expression();this.take(')');return{while:test,body:this.block()};
        }
        if(this.peek()==='for') {
            this.take();this.take('each');let name=this.take().v,type='';
            if(this.peek()!=='in'){type=name;name=this.take().v;}this.take('in');const array=this.expression();
            return{each:name,type,array,body:this.block()};
        }
        if(this.peek()==='return') {
            this.take();const value=this.peek()===';'?{literal:undefined}:this.expression();this.take(';');return{return:value};
        }
        const left=this.unary();
        if(this.peek()==='='){this.take();const value=this.expression();this.take(';');return{assign:left,value};}
        this.take(';');return{eval:left};
    }
    method() {
        this.take('(');const params=[];
        if(this.peek()!==')'){params.push(this.take().v);while(this.peek()===','){this.take();params.push(this.take().v);}}
        this.take(')');const body=this.block();this.take('EOF');return{params,body};
    }
}
function createRuntime(file, Sibelius) {
    const nodes=parsePlg(file), globals={},methods={},dialogs={};
    for(const n of nodes) {
        if(n.data?.startsWith('(')) {
            try { methods[n.label]=new Parser(n.data).method(); }
            catch(e) { throw Error(`${n.label}: ${e.message}`, {cause:e}); }
        }
        else if(n.data==='Dialog')dialogs[n.label]=n;
        else if(n.data!==null)globals[n.label]=/^(true|false)$/i.test(n.data)?/^true$/i.test(n.data):n.data;
        else globals[n.label]=n.children.map(c=>c.data);
    }
    const self=globals;self.File={Path:'C:/Plugins/TEExporter'};
    Object.assign(globals,dialogs);
    const builtins={Self:self,Sibelius,True:true,False:false,null:null,
        SpecialBarlineStartRepeat:0,SpecialBarlineEndRepeat:1,SpecialBarlineDouble:3,
        StartBeam:2,ContinueBeam:3,NoBeam:1,SingleBeam:4,
        PauseArtic:13,SquarePauseArtic:12,TriPauseArtic:14,PauseTypeNone:0,
        CaesuraSymbol:'249',ThickCaesuraSymbol:'250',CommaSymbol:'247',TickSymbol:'248',
        Length:s=>String(s).length,Asc:s=>String(s).charCodeAt(0),Chr:n=>String.fromCharCode(n),
        CharAt:(s,i)=>String(s)[i]||'',Substring:(s,i,n)=>String(s).substring(i,n===undefined?undefined:i+n),
        Round:Math.round,RoundDown:Math.floor,RoundUp:Math.ceil,
        CreateSparseArray:(...a)=>a,CreateArray:()=>[],CreateDictionary:(...a)=>Object.fromEntries(Array.from({length:a.length/2},(_,i)=>[a[i*2],a[i*2+1]])),
        JoinStrings:(a,s)=>a.join(s),Trace:s=>Sibelius.trace.push(String(s)),AddToPluginsMenu:(...a)=>Sibelius.menu=a,
        InterpreterOptionExists:()=>true,SetInterpreterOption:(...a)=>Sibelius.interpreterOption=a};
    let budget=2000000;
    const returned=Symbol('returned');
    function getMember(object,field,user=false) {
        if(object==null)throw Error(`Read ${field} on null`);
        if(Array.isArray(object)) {
            if(field==='Length'||field==='NumChildren')return object.length;
            if(field==='Push')return object.push.bind(object);
            if(field==='Join')return object.join.bind(object);
        }
        if(!(field in object)&&!user)throw Error(`Undocumented/missing property ${field}`);
        const value=object[field];return typeof value==='function'?value.bind(object):value??null;
    }
    function evaluate(e,local) {
        if(!e)return undefined;
        if('literal'in e)return e.literal;
        if(e.name) {
            if(e.name in local)return local[e.name];if(e.name in globals)return globals[e.name];
            if(e.name in builtins)return builtins[e.name];if(e.name in methods)return (...a)=>call(e.name,...a);
            throw Error(`Undefined name ${e.name}`);
        }
        if(e.object) {
            const object=evaluate(e.object,local);
            if(e.index)return object[evaluate(e.index,local)]??null;
            return getMember(object,e.field,e.user);
        }
        if(e.call)return evaluate(e.call,local)(...e.args.map(a=>evaluate(a,local)));
        if(e.unary)return e.unary==='not'?!evaluate(e.value,local):-Number(evaluate(e.value,local));
        const a=evaluate(e.left,local),b=evaluate(e.right,local);
        switch(e.op) {
            case '&':return String(a)+String(b);case '+':return Number(a)+Number(b);case '-':return Number(a)-Number(b);
            case '*':return Number(a)*Number(b);case '/':return Number(a)/Number(b);case '%':return Number(a)%Number(b);
            case '=':return a==b;case '!=':return a!=b;case '<':return a<b;case '>':return a>b;case '<=':return a<=b;case '>=':return a>=b;
            case 'and':return Boolean(a&&b);case 'or':return Boolean(a||b);default:throw Error(`Bad operator ${e.op}`);
        }
    }
    function assign(e,value,local) {
        if(e.name){if(e.name in globals)globals[e.name]=value;else local[e.name]=value;return;}
        const object=evaluate(e.object,local),key=e.index?evaluate(e.index,local):e.field;object[key]=value;
    }
    function execute(body,local) {
        for(const s of body) {
            if(--budget<0)throw Error('Test execution budget exceeded');
            if(s.assign)assign(s.assign,evaluate(s.value,local),local);
            else if(s.eval)evaluate(s.eval,local);
            else if(s.if)execute(evaluate(s.if,local)?s.yes:s.no,local);
            else if(s.while) {while(evaluate(s.while,local)){if(--budget<0)throw Error('Loop budget exceeded');execute(s.body,local);}}
            else if(s.each) {for(const object of evaluate(s.array,local)) {
                if(s.type && object.Type!==s.type && !object.BaseTypes?.includes(s.type))continue;
                local[s.each]=object;execute(s.body,local);
            }}
            else if('return'in s)throw{[returned]:true,value:evaluate(s.return,local)};
        }
    }
    function call(name,...args) {
        const m=methods[name];if(!m)throw Error(`No method ${name}`);
        const local=Object.fromEntries(m.params.map((p,i)=>[p,args[i]]));
        try{execute(m.body,local);}catch(e){if(e[returned])return e.value;throw Error(`${name}: ${e.message}`,{cause:e});}
    }
    return {globals,methods,dialogs,nodes,call};
}
module.exports={parsePlg,Parser,createRuntime};
