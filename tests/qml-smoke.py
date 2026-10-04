"""Offscreen Qt 6.10.2 QML smoke test; MuseScore/FileIO APIs use score-shaped doubles.
Run with the optional research/qt-runtime PySide6-Essentials test dependency.
QT_QUICK_CONTROLS_STYLE overrides Basic; TEX_SMOKE_YELLOW_PALETTE=1 simulates
a host application with yellow highlight/link colors. Each style retains PNGs.
This checks QML loading/rendering and interactions, not a live MuseScore/TE import.
"""
import os, sys, json, math, traceback, time
import xml.etree.ElementTree as ET
from pathlib import Path
BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / 'research/qt-runtime'))
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['QT_QUICK_BACKEND'] = 'software'
os.environ.setdefault('QT_QUICK_CONTROLS_STYLE', 'Basic')
HOST_STYLE=os.environ['QT_QUICK_CONTROLS_STYLE']
YELLOW_HOST=os.environ.get('TEX_SMOKE_YELLOW_PALETTE')=='1'
SCREENSHOT_TAG=os.environ.get('TEX_SMOKE_SCREENSHOT_TAG',HOST_STYLE.lower()+('-yellow' if YELLOW_HOST else ''))
from enum import IntEnum
from PySide6.QtCore import QObject, Property, Signal, Slot, QEnum, QUrl, QTimer, QPointF, QMetaObject, Qt, Q_ARG, qInstallMessageHandler
from PySide6.QtGui import QGuiApplication, QFont, QFontDatabase, QPalette, QColor
from PySide6.QtQuick import QQuickItem, QQuickWindow
from PySide6.QtQml import QQmlEngine, QQmlComponent, qmlRegisterType
from PySide6.QtTest import QTest

messages = []
def message_handler(kind, context, message):
    messages.append(message)
    if 'Error' in message or 'failed' in message.lower(): print(message)
qInstallMessageHandler(message_handler)
app = QGuiApplication([])
QFontDatabase.addApplicationFont('C:/Windows/Fonts/segoeui.ttf')
app.setFont(QFont('Segoe UI', 10))
app.setApplicationName('TEXporter-QML-test')
if YELLOW_HOST:
    palette=app.palette()
    for role in [QPalette.Highlight,QPalette.Link,QPalette.LinkVisited]: palette.setColor(role,QColor('#ffcc00'))
    palette.setColor(QPalette.HighlightedText,QColor('#202020'))
    app.setPalette(palette)
    assert app.palette().color(QPalette.Highlight).name()=='#ffcc00'

class Segment(QObject):
    def __init__(self, tick, mark='', parent=None):
        super().__init__(parent); self._tick = tick; self.mark = mark
    tick = Property(int, lambda self:self._tick, constant=True)
    segmentType = Property(int, lambda self:1, constant=True)
    annotations = Property('QVariantList', lambda self:[{'type':4,'text':self.mark}] if self.mark else [], constant=True)
    nextInMeasure = Property(QObject, lambda self:None, constant=True)
    @Slot(int, result=QObject)
    def elementAt(self, track): return None
class Measure(QObject):
    def __init__(self, i, parent=None):
        super().__init__(parent); self.i=i; self.next=None; self.seg=Segment(i*1920, {0:'A',4:'B'}.get(i,''), self)
    no = Property(int, lambda self:self.i, constant=True)
    tick = Property('QVariantMap', lambda self:{'numerator':self.i,'denominator':1}, constant=True)
    ticks = Property('QVariantMap', lambda self:{'numerator':1,'denominator':1}, constant=True)
    timesigNominal = Property('QVariantMap', lambda self:{'numerator':4,'denominator':4}, constant=True)
    firstSegment = Property(QObject, lambda self:self.seg, constant=True)
    nextMeasure = Property(QObject, lambda self:self.next, constant=True)
    elements = Property('QVariantList', lambda self:[], constant=True)
class Cursor(QObject):
    def __init__(self,parent=None): super().__init__(parent); self.at=0; self._filter=0; self._track=0
    filter = Property(int, lambda self:self._filter, lambda self,v:setattr(self,'_filter',v))
    track = Property(int, lambda self:self._track, lambda self,v:setattr(self,'_track',v))
    segment = Property(QObject, lambda self:self.parent().bars[min(7,max(0,int(self.at)))].seg)
    tempo = Property(float, lambda self:(120+min(4,max(0,self.at))*10)/60)
    @Slot('QVariant')
    def rewindToFraction(self,f): self.at=f['numerator']/f['denominator']
class Score(QObject):
    def __init__(self,parent=None):
        super().__init__(parent); self.bars=[Measure(i,self) for i in range(8)]; self.cursors=[]
        for a,b in zip(self.bars,self.bars[1:]): a.next=b
    title = Property(str,lambda self:'Offscreen test',constant=True)
    scoreName = Property(str,lambda self:'Offscreen test',constant=True)
    ntracks = Property(int,lambda self:4,constant=True)
    firstMeasure = Property(QObject,lambda self:self.bars[0],constant=True)
    selection = Property('QVariantMap',lambda self:{'isRange':True,'startSegment':{'tick':1920},'endSegment':{'tick':7680}},constant=True)
    spanners = Property('QVariantList',lambda self:[{'type':3,'spannerTick':{'numerator':0,'denominator':1},
        'spannerTicks':{'numerator':4,'denominator':1},'tempoChangeFactor':4/3,'tempoEasingMethod':0,'play':True}],constant=True)
    @Slot(result=QObject)
    def newCursor(self):
        c=Cursor(self); self.cursors.append(c); return c
    @Slot(str,result=str)
    def metaTag(self,key): return ''
class GroupNote(QObject):
    def __init__(self,mode,parent=None): super().__init__(parent); self.mode=mode
    type=Property(int,lambda self:9,constant=True)
    duration=Property('QVariantMap',lambda self:{'numerator':1,'denominator':8},constant=True)
    tuplet=Property(QObject,lambda self:None,constant=True)
    beam=Property(QObject,lambda self:None,constant=True)
    @Slot(bool,result=int)
    def actualBeamMode(self,beam_rests): return self.mode
class GroupSignature(QObject):
    type=Property(int,lambda self:2,constant=True)
    timesig=Property('QVariantMap',lambda self:{'numerator':7,'denominator':8},constant=True)
    numeratorString=Property(str,lambda self:'',constant=True)
class GroupSegment(QObject):
    def __init__(self,tick,item=None,signature=False,parent=None):
        super().__init__(parent); self.at=tick; self.item=item; self.signature=signature; self.next=None; self.marks=[]
    tick=Property(int,lambda self:self.at,constant=True)
    segmentType=Property(int,lambda self:2 if self.signature else 1,constant=True)
    annotations=Property('QVariantList',lambda self:self.marks,constant=True)
    nextInMeasure=Property(QObject,lambda self:self.next,constant=True)
    @Slot(int,result=QObject)
    def elementAt(self,track): return self.item if track==0 else None
class GroupMeasure(QObject):
    def __init__(self,i,parent=None):
        super().__init__(parent); self.i=i; self.next=None; self.segments=[]
        if i==0: self.segments.append(GroupSegment(0,GroupSignature(self),True,self))
        starts={0,3,5} if i==0 else {0,2,4}
        if i<2:
            for n in range(7): self.segments.append(GroupSegment(i*1680+n*240,GroupNote(2 if n in starts else 0,self),False,self))
        else: self.segments.append(GroupSegment(i*1680,None,False,self))
        for a,b in zip(self.segments,self.segments[1:]): a.next=b
    no=Property(int,lambda self:self.i,constant=True)
    tick=Property('QVariantMap',lambda self:{'numerator':self.i*7,'denominator':8},constant=True)
    ticks=Property('QVariantMap',lambda self:{'numerator':7,'denominator':8},constant=True)
    timesigNominal=Property('QVariantMap',lambda self:{'numerator':7,'denominator':8},constant=True)
    firstSegment=Property(QObject,lambda self:self.segments[0],constant=True)
    nextMeasure=Property(QObject,lambda self:self.next,constant=True)
    elements=Property('QVariantList',lambda self:[],constant=True)
class GroupCursor(Cursor):
    segment=Property(QObject,lambda self:self.parent().bars[min(2,max(0,self.at))].segments[0])
    tempo=Property(float,lambda self:2.0,constant=True)
    @Slot('QVariant')
    def rewindToFraction(self,f): self.at=round(f['numerator']/f['denominator']*8/7)
class GroupScore(Score):
    def __init__(self,parent=None):
        QObject.__init__(self,parent); self.bars=[GroupMeasure(i,self) for i in range(3)]; self.cursors=[]
        for a,b in zip(self.bars,self.bars[1:]): a.next=b
    spanners=Property('QVariantList',lambda self:[],constant=True)
    @Slot(result=QObject)
    def newCursor(self):
        c=GroupCursor(self); self.cursors.append(c); return c
class GroupHoldScore(GroupScore):
    def __init__(self,parent=None):
        super().__init__(parent)
        self.bars[0].segments[1].marks=[{'type':10,'timeStretch':2.0,'play':False}]
class TimingSegment(QObject):
    def __init__(self,tick,annotations,parent=None):
        super().__init__(parent); self.at=tick; self.items=annotations
    tick=Property(int,lambda self:self.at,constant=True)
    segmentType=Property(int,lambda self:1,constant=True)
    annotations=Property('QVariantList',lambda self:self.items,constant=True)
    nextInMeasure=Property(QObject,lambda self:None,constant=True)
    @Slot(int,result=QObject)
    def elementAt(self,track): return None
class TimingMeasure(QObject):
    def __init__(self,i,parent=None):
        super().__init__(parent); self.i=i; self.next=None; self.start=[0,1,5][i]; self.length=1 if i==0 else 4
        annotations=[{'type':10,'timeStretch':2.0,'play':True}] if i==1 else [{'type':12,'text':'Free time'}] if i==2 else []
        self.seg=TimingSegment(self.start*480,annotations,self)
    no=Property(int,lambda self:self.i,constant=True)
    tick=Property('QVariantMap',lambda self:{'numerator':self.start,'denominator':4},constant=True)
    ticks=Property('QVariantMap',lambda self:{'numerator':self.length,'denominator':4},constant=True)
    timesigNominal=Property('QVariantMap',lambda self:{'numerator':4,'denominator':4},constant=True)
    firstSegment=Property(QObject,lambda self:self.seg,constant=True)
    nextMeasure=Property(QObject,lambda self:self.next,constant=True)
    elements=Property('QVariantList',lambda self:[],constant=True)
    irregular=Property(bool,lambda self:self.i==0,constant=True)
class TimingCursor(Cursor):
    segment=Property(QObject,lambda self:self.parent().bars[self.at].seg)
    tempo=Property(float,lambda self:1.0 if self.at==1 else 2.0)
    @Slot('QVariant')
    def rewindToFraction(self,f):
        quarter=f['numerator']/f['denominator']*4
        self.at=0 if quarter<1 else 1 if quarter<5 else 2
class TimingScore(Score):
    def __init__(self,parent=None):
        QObject.__init__(self,parent); self.bars=[TimingMeasure(i,self) for i in range(3)]; self.cursors=[]
        for a,b in zip(self.bars,self.bars[1:]): a.next=b
    title=Property(str,lambda self:'Pickup and holds',constant=True)
    scoreName=Property(str,lambda self:'Pickup and holds',constant=True)
    spanners=Property('QVariantList',lambda self:[],constant=True)
    selection=Property('QVariantMap',lambda self:{'isRange':False},constant=True)
    @Slot(result=QObject)
    def newCursor(self):
        c=TimingCursor(self); self.cursors.append(c); return c
class MixedTimingMeasure(TimingMeasure):
    def __init__(self,i,parent=None):
        super().__init__(i,parent); self.start=0 if i==0 else 4; self.length=4 if i==0 else 3.5
        self.seg.at=self.start*480
    ticks=Property('QVariantMap',lambda self:{'numerator':1,'denominator':1} if self.i==0 else {'numerator':7,'denominator':8},constant=True)
    timesigNominal=Property('QVariantMap',lambda self:{'numerator':4,'denominator':4} if self.i==0 else {'numerator':7,'denominator':8},constant=True)
    irregular=Property(bool,lambda self:False,constant=True)
class MixedTimingCursor(TimingCursor):
    @Slot('QVariant')
    def rewindToFraction(self,f): self.at=0 if f['numerator']/f['denominator']*4<4 else 1
class MixedTimingScore(TimingScore):
    def __init__(self,parent=None):
        QObject.__init__(self,parent); self.bars=[MixedTimingMeasure(i,self) for i in range(2)]; self.cursors=[]
        self.bars[0].next=self.bars[1]
    title=Property(str,lambda self:'Mixed meter hold',constant=True)
    @Slot(result=QObject)
    def newCursor(self):
        c=MixedTimingCursor(self); self.cursors.append(c); return c
class RepeatTimingMeasure(TimingMeasure):
    repeatStart=Property(bool,lambda self:self.i==1,constant=True)
    repeatEnd=Property(bool,lambda self:self.i==1,constant=True)
    repeatCount=Property(int,lambda self:2,constant=True)
class RepeatTimingScore(TimingScore):
    def __init__(self,parent=None):
        QObject.__init__(self,parent); self.bars=[RepeatTimingMeasure(i,self) for i in range(3)]; self.cursors=[]
        for a,b in zip(self.bars,self.bars[1:]): a.next=b
score_factory=Score
class Plugin(QQuickItem):
    run=Signal()
    def __init__(self,parent=None):
        super().__init__(parent); self.score=score_factory(self); self._version=''
    title=Property(str,lambda self:'',lambda self,v:None)
    description=Property(str,lambda self:'',lambda self,v:None)
    version=Property(str,lambda self:self._version,lambda self,v:setattr(self,'_version',v))
    categoryCode=Property(str,lambda self:'',lambda self,v:None)
    pluginType=Property(str,lambda self:'',lambda self,v:None)
    requiresScore=Property(bool,lambda self:True,lambda self,v:None)
    curScore=Property(QObject,lambda self:self.score,constant=True)
    mscoreMajorVersion=Property(int,lambda self:4,constant=True)
    mscoreMinorVersion=Property(int,lambda self:7,constant=True)
    division=Property(int,lambda self:480,constant=True)
    Element=Property('QVariantMap',lambda self:{'TEMPO_TEXT':1,'TIMESIG':2,'GRADUAL_TEMPO_CHANGE':3,'REHEARSAL_MARK':4,'BAR_LINE':5,'VOLTA':6,'JUMP':7,'LAYOUT_BREAK':8,'CHORD':9,'FERMATA':10,'BREATH':11,'STAFF_TEXT':12,'SYSTEM_TEXT':13,'EXPRESSION':14,'REST':15},constant=True)
    Segment=Property('QVariantMap',lambda self:{'All':65535,'TimeSig':2},constant=True)
    BarLineType=Property('QVariantMap',lambda self:{'DOUBLE':2},constant=True)
    LayoutBreak=Property('QVariantMap',lambda self:{'SECTION':2},constant=True)
    Beam=Property('QVariantMap',lambda self:{'AUTO':0,'NONE':1,'BEGIN':2,'MID':5,'END':6,'INVALID':-1},constant=True)
    SymId=Property('QVariantMap',lambda self:{'caesura':101,'caesuraCurved':102,'caesuraShort':103,'caesuraThick':104,'chantCaesura':105,'caesuraSingleStroke':106},constant=True)
    @Slot()
    def quit(self): pass
class Settings(QObject):
    stores={'':{'application/paths/myScores':str(BASE)}}
    def __init__(self,parent=None): super().__init__(parent); self._category=''
    category=Property(str,lambda self:self._category,lambda self,v:setattr(self,'_category',v))
    @Slot(str,'QVariant',result='QVariant')
    def value(self,key,default): return self.stores.get(self._category,{}).get(key,default)
    @Slot(str,'QVariant')
    def setValue(self,key,value): self.stores.setdefault(self._category,{})[key]=value
    @Slot()
    def sync(self): pass
class FileIO(QObject):
    error=Signal(str)
    def __init__(self,parent=None):
        super().__init__(parent); self._source=''; self.data=''; self.writes=[]; self.fail=False; self.bad_read=False
    source=Property(str,lambda self:self._source,lambda self,v:setattr(self,'_source',v))
    @Slot(str,result=bool)
    def write(self,data):
        if self.fail: self.error.emit('Test write blocked'); return False
        self.data=data; self.writes.append((self._source,data)); return True
    @Slot(result=str)
    def read(self): return 'bad readback' if self.bad_read else self.data+'\n'
class FileDialog(QObject):
    accepted=Signal(); rejected=Signal()
    class Mode(IntEnum): Load=0; Save=1
    QEnum(Mode)
    def __init__(self,parent=None):
        super().__init__(parent); self._folder=''; self._file=''; self._title=''; self.opened=False; self.open_count=0
    type=Property(int,lambda self:1,lambda self,v:None)
    title=Property(str,lambda self:self._title,lambda self,v:setattr(self,'_title',v))
    folder=Property(str,lambda self:self._folder,lambda self,v:setattr(self,'_folder',v))
    filePath=Property(str,lambda self:self._file,lambda self,v:setattr(self,'_file',v))
    @Slot()
    def open(self): self.opened=True; self.open_count+=1
for cls,name in [(Plugin,'MuseScore'),(Settings,'Settings'),(FileDialog,'FileDialog')]: qmlRegisterType(cls,'MuseScore',3,0,name)
qmlRegisterType(FileIO,'FileIO',3,0,'FileIO')

def qml_value(value):
    return value.toVariant() if hasattr(value,'toVariant') else value

def quick_descendants(item):
    for child in item.childItems():
        yield child
        yield from quick_descendants(child)

def wait_settled(plugin,timeout=3):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        app.processEvents()
        timer=plugin.findChild(QObject,'previewTimer')
        if not plugin.property('updatingPreview') and not (timer and timer.property('running')):
            app.processEvents()
            return
        time.sleep(0.01)
    raise AssertionError('Live preview did not settle: '+str(plugin.property('validationError')))

def signal(control,name,arg=None):
    args=[] if arg is None else [Q_ARG(int,arg)]
    assert QMetaObject.invokeMethod(control,name,Qt.DirectConnection,*args),name

def click_option(plugin,name,checked):
    control=plugin.findChild(QObject,name)
    assert control is not None,name
    control.setProperty('checked',checked); signal(control,'clicked')
    wait_settled(plugin)

def option_by_text(plugin,text):
    return next(item for item in quick_descendants(plugin) if item.property('text')==text and isinstance(item.property('checked'),bool))

def click_text_option(plugin,text,checked):
    control=option_by_text(plugin,text)
    control.setProperty('checked',checked); signal(control,'clicked')
    wait_settled(plugin)

def set_combo(plugin,name,index):
    control=plugin.findChild(QObject,name)
    control.setProperty('currentIndex',index); signal(control,'activated',index)

def set_range(plugin,first,last):
    set_combo(plugin,'rangeMode',2)
    for name,value in [('firstBar',first),('lastBar',last)]:
        control=plugin.findChild(QObject,name)
        control.setProperty('value',value); signal(control,'valueModified')
    wait_settled(plugin)

def show_row(plugin,index):
    table=plugin.findChild(QObject,'presetTable')
    assert table is not None,'Missing presetTable'
    assert QMetaObject.invokeMethod(table,'positionViewAtIndex',Qt.DirectConnection,Q_ARG(int,index),Q_ARG(int,0))
    app.processEvents()

def timing_controls(plugin,bar_index,name):
    found=[]
    for control in quick_descendants(plugin):
        if control.objectName()!=name: continue
        ancestor=control.parentItem()
        while ancestor is not None:
            if ancestor.property('timingBarIndex')==bar_index:
                found.append(control); break
            ancestor=ancestor.parentItem()
    return found

def timing_control(plugin,bar_index,name):
    controls=timing_controls(plugin,bar_index,name)
    if controls: return controls[0]
    raise AssertionError('Missing '+name+' for written bar '+str(bar_index))

def edit_field(field,text):
    field.forceActiveFocus()
    field.setProperty('text',text); field.setProperty('cursorPosition',len(text))
    signal(field,'textEdited'); app.processEvents()
    assert field.property('activeFocus') is True,'Text editing replaced the focused control'
    assert field.property('text')==text,'Live validation rewrote in-progress text'
    assert field.property('cursorPosition')==len(text),'Live validation moved the caret'

def key_click(control,window,key):
    window.requestActivate(); control.forceActiveFocus(Qt.TabFocusReason); app.processEvents()
    QTest.keyClick(window,key); app.processEvents()

def color_name(value):
    return QColor(value).name()

def qml_object(owner,name):
    # Qt Quick Templates exposes Popup pointers without a PySide converter.
    # The JS facade safely returns the same object through QObject instead.
    value=engine.newQObject(owner).property(name).toQObject()
    assert value is not None,name
    return value

def assert_blue_controls(plugin):
    controls=[item for item in quick_descendants(plugin) if item.metaObject().className().startswith('Blue')]
    assert controls,'No custom blue controls rendered'
    for control in controls:
        assert color_name(control.property('accentColor'))=='#1976d2',control.metaObject().className()
        if control.property('selectionColor') is not None:
            assert color_name(control.property('selectionColor'))=='#1976d2'
        if control.metaObject().className().startswith('BlueCheckBox') and control.property('checked'):
            assert color_name(control.property('indicator').property('color'))=='#1976d2'
        if control.metaObject().className().startswith('BlueTabButton') and control.property('checked'):
            assert color_name(control.property('background').property('color'))=='#1976d2'
        if control.metaObject().className().startswith('BlueRadioButton') and control.property('checked'):
            assert any(color_name(item.property('color'))=='#1976d2'
                for item in control.property('indicator').childItems() if item.property('color') is not None)
        if control.metaObject().className().startswith('BlueButton') and control.property('primary'):
            assert color_name(control.property('background').property('color'))=='#1976d2'

def assert_scrollbar_geometry(plugin):
    bars=[item for item in quick_descendants(plugin) if item.metaObject().className().startswith('BlueScrollBar')]
    assert bars,'No custom scrollbars rendered'
    visible=0
    for bar in bars:
        if bar.property('size')>=1:
            assert not bar.property('visible'),'AsNeeded bar is visible when its content fits'
        if not bar.property('visible'): continue
        visible+=1
        owner=bar.parentItem()
        assert owner is not None
        if bar.property('orientation')==Qt.Vertical:
            expected=0 if bar.property('mirrored') else owner.width()-bar.width()
            assert abs(bar.x()-expected)<=1,('Vertical scrollbar overlays content',bar.x(),expected)
            assert bar.y()>=-1 and bar.y()+bar.height()<=owner.height()+1
        else:
            assert abs(bar.y()-(owner.height()-bar.height()))<=1,('Horizontal scrollbar overlays content',bar.y(),owner.height())
            assert bar.x()>=-1 and bar.x()+bar.width()<=owner.width()+1
    assert visible,'The overflowing settings/preview needs a visible scrollbar'

def save_screenshot(window,name):
    out=BASE/'tests/generated'; out.mkdir(exist_ok=True)
    image=window.grabWindow()
    assert image.save(str(out/(name+'.png')))
    assert image.save(str(out/(name+'-'+SCREENSHOT_TAG+'.png')))

engine=QQmlEngine()
component=QQmlComponent(engine,QUrl.fromLocalFile(str(BASE/'plugin/TEXporter.qml')))
assert not component.isError(), '\n'.join(e.toString() for e in component.errors())
root=component.create()
assert root is not None, '\n'.join(e.toString() for e in component.errors())
window=QQuickWindow(); window.resize(1000,760); root.setParentItem(window.contentItem()); window.show()
root.run.emit()
wait_settled(root)
assert root.property('ready'),root.property('validationError')
assert root.findChild(QObject,'presetRows').property('count')==2
assert root.findChild(QObject,'countIn').property('checked') is True
assert root.findChild(QObject,'fullMet').property('checked') is True
assert root.findChild(QObject,'halfMet').property('checked') is False
assert root.findChild(QObject,'downbeatMet').property('checked') is False
# Export must retain edits, validate them and use the configured Scores path.
root.editRow(0,'name','Edited A & B'); root.editRow(0,'startTempo','122.25'); root.exportFile()
dialog=root.findChild(FileDialog,'saveDialog'); assert dialog.opened
assert dialog.folder.startswith(str(BASE).replace('\\','/'))
assert dialog.folder.endswith(' [Full Met].tetmetgroup')
dialog.filePath=str(BASE/'tests/generated/UI-test.tetmetgroup'); dialog.accepted.emit()
xml=root.findChild(FileIO,'outputFile').data
assert 'name="Edited A &amp; B"' in xml and 'starting_tempo="122.25"' in xml
assert len(ET.fromstring(xml).findall('MetroPreset'))==2
assert ET.fromstring(xml).get('do_countin')=='1'
assert ET.fromstring(xml).get('countin_type')=='4'
assert ET.fromstring(xml).find('MetroCountIn').get('unit')=='2'
assert ET.fromstring(xml).find('MetroCountIn').get('eighthcount')=='16'
assert ET.fromstring(xml).find('MetroCountIn').get('beatmask64')=='21845'
assert ET.fromstring(xml).find('MetroCountIn').get('accentmask')=='5393'
assert ET.fromstring(xml).find('MetroCountIn').get('allow_accent')=='1'
root.editRow(0,'bars',''); assert root.property('validationError')
root.editRow(0,'bars','6'); root.editRow(0,'rampLength','24')
assert '10 bars' in root.property('summary'),root.property('summary')
root.editRow(0,'rampLength','16')
root.editRow(0,'bars','4'); assert not root.property('validationError'),root.property('validationError')
# Reusable settings survive a newly-created dialog; per-score ranges do not.
click_option(root,'countIn',False)
assert root.property('ready'),root.property('validationError')
assert json.loads(Settings.stores['TEExporter']['options'])['countInEnabled'] is False
root.exportFile(); dialog.accepted.emit()
disabled_xml=ET.fromstring(root.findChild(FileIO,'outputFile').data)
assert disabled_xml.get('do_countin')=='0'
assert len(disabled_xml.findall('MetroPreset'))==2
root2=component.create(); root2.run.emit(); wait_settled(root2)
assert root2.findChild(QObject,'countIn').property('checked') is False
# Structural options rebuild automatically, update untouched musical defaults,
# and preserve edits on unrelated presets whose source measures stay the same.
source_root=component.create(); source_root.run.emit(); wait_settled(source_root)
source_root.editRow(1,'name','Unrelated edit'); source_root.editRow(1,'startTempo','166.25')
click_text_option(source_root,'Accelerando / ritardando',False)
source_parts=ET.fromstring(source_root.property('pendingXml')).findall('MetroPreset')
assert [p.get('tempo') for p in source_parts[:4]]==['120','130','140','150']
assert source_parts[-1].get('name')=='Unrelated edit' and source_parts[-1].get('tempo')=='166.25'
click_text_option(source_root,'Accelerando / ritardando',True)
source_parts=ET.fromstring(source_root.property('pendingXml')).findall('MetroPreset')
assert len(source_parts)==2
assert source_parts[-1].get('name')=='Unrelated edit' and source_parts[-1].get('tempo')=='166.25'
source_root.editRow(1,'name',''); source_root.editRow(1,'startTempo','160')
click_text_option(source_root,'Tempo changes',False)
source_parts=ET.fromstring(source_root.property('pendingXml')).findall('MetroPreset')
assert len(source_parts)==1 and source_parts[0].get('tempo')=='120'
click_text_option(source_root,'Tempo changes',True)
source_parts=ET.fromstring(source_root.property('pendingXml')).findall('MetroPreset')
assert len(source_parts)==2 and source_parts[0].get('transition')=='1'
assert source_parts[-1].get('tempo')=='160'
# Invalid in-progress field text remains unsavable while another option changes.
source_root.editRow(0,'startTempo','')
click_option(source_root,'countIn',True)
source_dialog=source_root.findChild(FileDialog,'saveDialog')
source_root.exportFile(); assert source_dialog.open_count==0
assert source_root.property('validationError') and not source_root.property('pendingXml')
source_root.editRow(0,'startTempo','120')
# Export immediately after an option edit must not save the old full-score range.
set_combo(source_root,'rangeMode',2)
for name,value in [('firstBar',1),('lastBar',2)]:
    control=source_root.findChild(QObject,name); control.setProperty('value',value); signal(control,'valueModified')
source_root.exportFile(); wait_settled(source_root)
if source_dialog.open_count==0: source_root.exportFile()
assert source_dialog.open_count==1
assert sum(int(p.get('barcount')) for p in ET.fromstring(source_root.property('pendingXml')).findall('MetroPreset'))==2
source_dialog.rejected.emit(); app.processEvents()
# Multi-file export snapshots the edited preview and opens a native picker for
# each selected version, preserving individual overwrite confirmations.
output_file=root.findChild(FileIO,'outputFile')
def select_versions(full,half,downbeat):
    for name,value in [('fullMet',full),('halfMet',half),('downbeatMet',downbeat)]:
        control=root.findChild(QObject,name); control.setProperty('checked',value); signal(control,'clicked')
    wait_settled(root)
click_option(root,'countIn',True)
root.editRow(0,'name','Kept edits'); root.editRow(0,'startTempo','122.25')
select_versions(True,True,True)
assert root.findChild(QObject,'presetRows').property('count')==2
assert 'name="Kept edits"' in root.property('pendingXml')
start=len(output_file.writes); root.exportFile()
for index,(label,mask) in enumerate([('Full Met','-1'),('Half-note Met','-11'),('Downbeat Met','-15')]):
    assert dialog.folder.endswith(' ['+label+'].tetmetgroup'),dialog.folder
    assert dialog.title=='Save '+label+' ('+str(index+1)+'/3)'
    open_count=dialog.open_count; root.exportFile(); assert dialog.open_count==open_count
    dialog.filePath=str(BASE/'tests/generated'/('UI-'+label+'.tetmetgroup')); dialog.accepted.emit()
    parsed=ET.fromstring(output_file.data)
    assert parsed.get('name')=='Offscreen test ['+label+']'
    assert parsed.get('do_countin')=='1'
    assert parsed.findall('MetroPreset')[0].get('name')=='Kept edits'
    assert parsed.findall('MetroPreset')[0].get('starting_tempo')=='122.25'
    assert all(p.get('beatmask')==mask for p in parsed.findall('MetroPreset'))
    assert parsed.find('MetroCountIn').get('accentmask')=='5393'
    app.processEvents()
assert len(output_file.writes)==start+3 and not root.property('exporting')
assert 'Exported 3 groups.' in root.property('summary')
version_xml=output_file.writes[start:]
# Cancel after the first saved group: keep it and stop the remaining queue.
select_versions(False,True,True); start=len(output_file.writes); root.exportFile()
dialog.filePath=str(BASE/'tests/generated/canceled-half.tetmetgroup'); dialog.accepted.emit(); app.processEvents()
dialog.rejected.emit(); app.processEvents()
assert len(output_file.writes)==start+1 and not root.property('exporting')
assert '1 of 2 groups saved' in root.property('summary')
# Cancel before writing anything, then reject a duplicate destination.
start=len(output_file.writes); root.exportFile(); dialog.rejected.emit(); app.processEvents()
assert len(output_file.writes)==start and '0 of 2 groups saved' in root.property('summary')
root.exportFile(); dialog.filePath=str(BASE/'tests/generated/same.tetmetgroup')
dialog.accepted.emit(); app.processEvents(); dialog.accepted.emit(); app.processEvents()
assert len(output_file.writes)==start+1 and not root.property('exporting')
assert 'different filename' in root.property('validationError')
# Invalid extensions, write errors and readback errors stop the queue.
start=len(output_file.writes); root.exportFile(); dialog.filePath=str(BASE/'tests/generated/wrong.txt')
dialog.accepted.emit(); app.processEvents()
assert len(output_file.writes)==start and not root.property('exporting')
root.exportFile(); dialog.filePath=str(BASE/'tests/generated/blocked.tetmetgroup'); output_file.fail=True
dialog.accepted.emit(); app.processEvents(); output_file.fail=False
assert len(output_file.writes)==start and 'Test write blocked' in root.property('validationError')
root.exportFile(); output_file.bad_read=True; dialog.accepted.emit(); app.processEvents(); output_file.bad_read=False
assert not root.property('exporting') and 'did not match' in root.property('validationError')
# All unchecked blocks export while retaining preview edits. A valid selection
# clears the error and preferences restore the new checkboxes on the next run.
select_versions(False,False,False); assert 'at least one' in root.property('validationError')
open_count=dialog.open_count; root.exportFile(); assert dialog.open_count==open_count
assert root.findChild(QObject,'presetRows').property('count')==2
select_versions(False,True,False); assert not root.property('validationError')
assert 'name="Kept edits"' in root.property('pendingXml')
root3=component.create(); root3.run.emit(); wait_settled(root3)
assert root3.findChild(QObject,'fullMet').property('checked') is False
assert root3.findChild(QObject,'halfMet').property('checked') is True
assert root3.findChild(QObject,'downbeatMet').property('checked') is False
select_versions(True,True,True)
click_option(root,'countIn',True)
set_range(root,2,4)
assert root.property('writtenCount')==3 and root.property('ready'),root.property('validationError')
root.findChild(QObject,'tabs').setProperty('currentIndex',1)
# Exercise real Qt QObject methods/properties for automatic /8 grouping, then
# render the actual editable Grouping control and export all three patterns.
score_factory=GroupScore
group_root=component.create(); group_root.run.emit(); wait_settled(group_root)
assert group_root.property('ready'),group_root.property('validationError')
assert group_root.findChild(QObject,'presetRows').property('count')==2
group_xml=ET.fromstring(group_root.property('pendingXml'))
assert [p.find('MetroMeterMapInfo').get('accentmask64') for p in group_xml.findall('MetroPreset')]==['41','21']
assert [p.get('barcount') for p in group_xml.findall('MetroPreset')]==['1','2']
group_root.editRow(0,'grouping','2+2+2'); assert 'add up to 7' in group_root.property('validationError')
group_root.editRow(0,'grouping','3+2+2'); assert not group_root.property('validationError')
group_root.exportFile(); group_dialog=group_root.findChild(FileDialog,'saveDialog')
group_output=group_root.findChild(FileIO,'outputFile')
group_version_xml=[]
for label,mask,accents in [('Full Met','-1','41'),('Half-note Met','-87','41'),('Downbeat Met','-127','1')]:
    group_dialog.filePath=str(BASE/'tests/generated'/('UI-Grouping-'+label+'.tetmetgroup'))
    group_dialog.accepted.emit(); app.processEvents()
    parsed=ET.fromstring(group_output.data); meter=parsed.find('MetroPreset/MetroMeterMapInfo')
    assert meter.get('beatmask')==mask and meter.get('accentmask64')==accents
    assert parsed.find('MetroCountIn').get('accentmask')=='5393'
    group_version_xml.append((group_dialog.filePath,group_output.data))
assert not group_root.property('exporting')
group_window=QQuickWindow(); group_window.resize(1000,760)
group_root.setParentItem(group_window.contentItem()); group_window.show()
group_root.findChild(QObject,'tabs').setProperty('currentIndex',1)

# A one-quarter pickup remains short. Written fermatas and explicit free time
# require a fresh inline decision before the native save picker can open.
score_factory=TimingScore
timing_root=component.create(); timing_root.run.emit(); wait_settled(timing_root)
assert timing_root.property('ready'),timing_root.property('validationError')
for name,value in [('fullMet',True),('halfMet',False),('downbeatMet',False)]:
    click_option(timing_root,name,value)
timing_dialog=timing_root.findChild(FileDialog,'saveDialog')
timing_output=timing_root.findChild(FileIO,'outputFile')
assert timing_root.property('timingPendingCount')==2
assert qml_value(timing_root.property('timingDecisions'))=={}
initial_timing_xml=ET.fromstring(timing_root.property('pendingXml'))
assert [p.find('MetroMeterMapInfo').get('topcount') for p in initial_timing_xml.findall('MetroPreset')]==['1','4','4']
assert [p.get('tempo') for p in initial_timing_xml.findall('MetroPreset')]==['120','120','120']
timing_window=QQuickWindow(); timing_window.resize(1000,760)
timing_root.setParentItem(timing_window.contentItem()); timing_window.show()
timing_root.findChild(QObject,'tabs').setProperty('currentIndex',1)
timing_root.exportFile()
app.processEvents()
for bar_index in [2,3]:
    show_row(timing_root,bar_index-1)
    choice=timing_control(timing_root,bar_index,'timingChoice')
    assert choice.property('currentIndex')==0
    assert choice.property('currentText')=='Choose handling…'
    assert choice.property('visible') is True
assert timing_dialog.open_count==0 and not timing_output.writes
assert timing_root.findChild(QObject,'tabs').property('currentIndex')==1
choice=timing_control(timing_root,2,'timingChoice')
choice.setProperty('currentIndex',1); signal(choice,'activated',1)
assert timing_root.property('timingPendingCount')==1
timing_root.exportFile(); assert timing_dialog.open_count==0
show_row(timing_root,2)
choice=timing_control(timing_root,3,'timingChoice')
choice.setProperty('currentIndex',2); signal(choice,'activated',2)
counts_field=timing_control(timing_root,3,'timingCounts')
edit_field(counts_field,'6')
assert timing_root.property('timingPendingCount')==0
assert not timing_root.property('timingError')
assert '≈ 5.5 s' in timing_root.property('summary'),timing_root.property('summary')
timing_root.exportFile(); assert timing_dialog.open_count==1
timing_dialog.filePath=str(BASE/'tests/generated/UI-Timing.tetmetgroup')
timing_dialog.accepted.emit(); app.processEvents()
timing_xml=timing_output.data
timing_presets=ET.fromstring(timing_xml).findall('MetroPreset')
assert [p.find('MetroMeterMapInfo').get('topcount') for p in timing_presets]==['1','4','6']
assert [p.get('barcount') for p in timing_presets]==['1','1','1']
assert sum(float(p.find('MetroMeterMapInfo').get('topcount'))*4/int(p.find('MetroMeterMapInfo').get('notebase'))*
    60/float(p.get('tempo')) for p in timing_presets)==5.5
assert ET.fromstring(timing_xml).find('MetroCountIn').get('accentmask')=='5393'

# Changing a duration decision updates the existing delegate in place, without
# discarding edits on source rows or rewriting a focused field and its caret.
timing_root.editRow(0,'name','Pickup edit')
timing_root.editRow(1,'startTempo','122.25')
timing_root.editRow(2,'name','Ending edit')
edit_field(counts_field,'8')
assert timing_control(timing_root,3,'timingCounts')==counts_field
edited_timing=ET.fromstring(timing_root.property('pendingXml')).findall('MetroPreset')
assert edited_timing[0].get('name')=='Pickup edit'
assert edited_timing[1].get('tempo')=='122.25'
assert edited_timing[2].get('name')=='Ending edit'
assert edited_timing[2].find('MetroMeterMapInfo').get('topcount')=='8'

# Invalid and reset choices still block all writes, using the steady preview
# only as a visual fallback until the user supplies a valid decision.
open_count=timing_dialog.open_count; write_count=len(timing_output.writes)
for invalid_counts in ['0','']:
    edit_field(counts_field,invalid_counts)
    assert timing_control(timing_root,3,'timingCounts')==counts_field
    assert timing_root.property('timingPendingCount')==1
    assert 'positive total count' in timing_root.property('timingError')
    timing_root.exportFile()
    assert timing_dialog.open_count==open_count and len(timing_output.writes)==write_count
for partial_counts in ['6.','6.0']:
    edit_field(counts_field,partial_counts)
    assert timing_control(timing_root,3,'timingCounts')==counts_field
    assert timing_root.property('timingPendingCount')==0
edit_field(counts_field,'6')
choice=timing_control(timing_root,3,'timingChoice')
choice.setProperty('currentIndex',0); signal(choice,'activated',0)
assert timing_root.property('timingPendingCount')==1
timing_root.exportFile(); assert timing_dialog.open_count==open_count

# Required inputs and attention are scoped to the exported range. An unresolved
# free-time bar outside the range must not prevent exporting the selected music.
set_range(timing_root,1,2)
assert timing_root.property('ready'),timing_root.property('validationError')
assert timing_root.property('timingPendingCount')==0
assert [part.get('sourceIndices') for part in qml_value(timing_root.property('regions'))]==[[1],[2]]
assert all(item.get('measureIndex')!=3 for item in qml_value(timing_root.property('attentionItems')))
timing_root.exportFile(); assert timing_dialog.open_count==open_count+1
timing_dialog.rejected.emit(); app.processEvents()
assert len(timing_output.writes)==write_count
set_range(timing_root,1,1)
assert timing_root.property('timingPendingCount')==0
assert qml_value(timing_root.property('regions'))[0].get('sourceIndices')==[1]

# Raw in-progress range input cannot fall back to the SpinBox's previous valid
# value when Export is clicked, including native TextInput focus-loss handling.
timing_root.findChild(QObject,'tabs').setProperty('currentIndex',0)
first_spin=timing_root.findChild(QObject,'firstBar')
first_editor=first_spin.property('contentItem')
for invalid_range in ['', '2.5', '0', '4']:
    edit_field(first_editor,invalid_range)
    assert timing_root.property('validationError')
    before=timing_dialog.open_count
    timing_root.findChild(QObject,'tabs').setProperty('currentIndex',1)
    timing_root.exportFile(); wait_settled(timing_root)
    assert timing_dialog.open_count==before and len(timing_output.writes)==write_count
    assert timing_root.findChild(QObject,'tabs').property('currentIndex')==0
    assert first_editor.property('activeFocus') is True
    assert not timing_root.property('pendingXml')
    assert qml_value(timing_root.property('rangeInputs'))['first']==invalid_range
    # Simulate focus loss to the other range input, then another immediate save.
    timing_root.findChild(QObject,'lastBar').property('contentItem').forceActiveFocus()
    app.processEvents(); timing_root.exportFile(); wait_settled(timing_root)
    assert timing_dialog.open_count==before and not timing_root.property('pendingXml')
    assert first_editor.property('text')==invalid_range
edit_field(first_editor,'1'); wait_settled(timing_root)
assert not timing_root.property('validationError')
timing_root.exportFile(); assert timing_dialog.open_count==before+1
timing_dialog.rejected.emit(); app.processEvents()
set_range(timing_root,2,1)
assert timing_root.property('validationError') and not timing_root.property('pendingXml')
before=timing_dialog.open_count
timing_root.findChild(QObject,'tabs').setProperty('currentIndex',1)
timing_root.exportFile(); app.processEvents()
assert timing_dialog.open_count==before and timing_root.findChild(QObject,'tabs').property('currentIndex')==0
assert first_editor.property('activeFocus') is True
set_range(timing_root,1,1)

# A detected /8 fermata uses the same inline workflow. Grouping validation must
# not replace the editor while a partial grouping or count is being typed.
score_factory=GroupHoldScore
group_hold_root=component.create(); group_hold_root.run.emit(); wait_settled(group_hold_root)
group_hold_window=QQuickWindow(); group_hold_window.resize(1000,760)
group_hold_root.setParentItem(group_hold_window.contentItem()); group_hold_window.show()
group_hold_root.findChild(QObject,'tabs').setProperty('currentIndex',1); app.processEvents()
assert group_hold_root.property('timingPendingCount')==1
group_hold_dialog=group_hold_root.findChild(FileDialog,'saveDialog')
group_hold_output=group_hold_root.findChild(FileIO,'outputFile')
group_hold_root.editRow(0,'name','Grouping edit'); group_hold_root.editRow(0,'startTempo','122.25')
grouping_field=timing_control(group_hold_root,1,'groupingField')
for grouping_text in ['2','2+','2+2+3']:
    edit_field(grouping_field,grouping_text)
    assert timing_control(group_hold_root,1,'groupingField')==grouping_field
    if grouping_text!='2+2+3':
        assert group_hold_root.property('validationError')
        group_hold_root.exportFile(); assert group_hold_dialog.open_count==0
        assert not group_hold_output.writes
assert not group_hold_root.property('validationError')
choice=timing_control(group_hold_root,1,'timingChoice')
choice.setProperty('currentIndex',2); signal(choice,'activated',2)
group_counts=timing_control(group_hold_root,1,'timingCounts')
edit_field(group_counts,'7.0')
assert timing_control(group_hold_root,1,'timingCounts')==group_counts
group_edits=ET.fromstring(group_hold_root.property('pendingXml')).find('MetroPreset')
assert group_edits.get('name')=='Grouping edit' and group_edits.get('tempo')=='122.25'
assert group_edits.find('MetroMeterMapInfo').get('accentmask64')=='21'
click_option(group_hold_root,'countIn',False)
group_edits=ET.fromstring(group_hold_root.property('pendingXml')).find('MetroPreset')
assert group_edits.get('name')=='Grouping edit' and group_edits.get('tempo')=='122.25'
assert group_edits.find('MetroMeterMapInfo').get('accentmask64')=='21'
assert group_counts.property('text')=='7.0' and group_counts.property('activeFocus') is True
click_text_option(group_hold_root,'Accelerando / ritardando',False)
group_edits=ET.fromstring(group_hold_root.property('pendingXml')).find('MetroPreset')
assert group_edits.get('name')=='Grouping edit' and group_edits.get('tempo')=='122.25'
assert group_edits.find('MetroMeterMapInfo').get('accentmask64')=='21'
assert group_hold_root.property('timingPendingCount')==0
click_text_option(group_hold_root,'Accelerando / ritardando',True)
click_option(group_hold_root,'countIn',True)

# Count choices preserve their physical duration when the exported click unit
# changes: six eighths become three quarters when meter changes are disabled.
score_factory=MixedTimingScore
mixed_root=component.create(); mixed_root.run.emit(); wait_settled(mixed_root)
assert mixed_root.property('ready'),mixed_root.property('validationError')
assert mixed_root.property('timingPendingCount')==1
mixed_root.setTimingDecision(2,2,'6')
mixed_xml=ET.fromstring(mixed_root.property('pendingXml')).findall('MetroPreset')
assert mixed_xml[1].find('MetroMeterMapInfo').get('topcount')=='6'
assert mixed_xml[1].find('MetroMeterMapInfo').get('notebase')=='8'
assert qml_value(mixed_root.property('timingDecisions'))['2']['denominator']==8
click_text_option(mixed_root,'Meter changes',False)
assert mixed_root.property('timingPendingCount')==0
frozen_xml=ET.fromstring(mixed_root.property('pendingXml')).findall('MetroPreset')
assert frozen_xml[1].find('MetroMeterMapInfo').get('topcount')=='3'
assert frozen_xml[1].find('MetroMeterMapInfo').get('notebase')=='4'
assert '≈ 3.5 s' in mixed_root.property('summary'),mixed_root.property('summary')
mixed_window=QQuickWindow(); mixed_window.resize(1000,760)
mixed_root.setParentItem(mixed_window.contentItem()); mixed_window.show()
mixed_root.findChild(QObject,'tabs').setProperty('currentIndex',1); app.processEvents()
show_row(mixed_root,1)
assert timing_control(mixed_root,2,'timingCounts').property('text')=='3'
click_text_option(mixed_root,'Meter changes',True)
assert timing_control(mixed_root,2,'timingCounts').property('text')=='6'
restored_xml=ET.fromstring(mixed_root.property('pendingXml')).findall('MetroPreset')
assert restored_xml[1].find('MetroMeterMapInfo').get('topcount')=='6'
assert restored_xml[1].find('MetroMeterMapInfo').get('notebase')=='8'

# A written bar's choice is reused across both repeat visits. Pending decisions
# count distinct written bars, while all visits receive the selected duration.
score_factory=RepeatTimingScore
repeat_root=component.create(); repeat_root.run.emit(); wait_settled(repeat_root)
assert repeat_root.property('timingPendingCount')==2
assert repeat_root.findChild(QObject,'presetRows').property('count')==4
repeat_root.setTimingDecision(2,2,'6')
assert repeat_root.property('timingPendingCount')==1
repeat_root.setTimingDecision(3,1,'4')
assert repeat_root.property('timingPendingCount')==0
repeat_parts=ET.fromstring(repeat_root.property('pendingXml')).findall('MetroPreset')
assert [p.find('MetroMeterMapInfo').get('topcount') for p in repeat_parts]==['1','6','6','4']
assert [p.get('barcount') for p in repeat_parts]==['1','1','1','1']
repeat_window=QQuickWindow(); repeat_window.resize(1000,760)
repeat_root.setParentItem(repeat_window.contentItem()); repeat_window.show()
repeat_root.findChild(QObject,'tabs').setProperty('currentIndex',1); app.processEvents()
assert len(timing_controls(repeat_root,2,'timingChoice'))==2
assert all(item.property('currentIndex')==2 for item in timing_controls(repeat_root,2,'timingChoice'))
repeat_root.setTimingDecision(2,1,'6'); app.processEvents()
assert all(item.property('currentIndex')==1 for item in timing_controls(repeat_root,2,'timingChoice'))

# Choices never enter reusable preferences; reopening the dialog requires new
# per-export choices. Live option changes keep inline controls available.
stored_options=json.loads(Settings.stores['TEExporter']['options'])
assert 'timingDecisions' not in stored_options and 'manualFreeTime' not in stored_options
score_factory=TimingScore
reopened_root=component.create(); reopened_root.run.emit(); wait_settled(reopened_root)
assert reopened_root.property('timingPendingCount')==2
assert qml_value(reopened_root.property('timingDecisions'))=={}
timing_root.setParentItem(None)
reopened_root.setParentItem(timing_window.contentItem())
reopened_root.findChild(QObject,'tabs').setProperty('currentIndex',1); app.processEvents()
reopened_dialog=reopened_root.findChild(FileDialog,'saveDialog')
click_text_option(reopened_root,'Accelerando / ritardando',False)
assert reopened_root.property('ready') and reopened_root.property('timingPendingCount')==2
reopened_root.exportFile(); app.processEvents()
assert reopened_dialog.open_count==0
choice=timing_control(reopened_root,2,'timingChoice')
assert choice.property('currentIndex')==0
choice.setProperty('currentIndex',1); signal(choice,'activated',1)
assert reopened_root.property('timingPendingCount')==1
choice.setProperty('currentIndex',0); signal(choice,'activated',0)
assert reopened_root.property('timingPendingCount')==2
assert all(timing_control(reopened_root,index,'timingChoice').property('currentIndex')==0 for index in [2,3])
assert not [item for item in quick_descendants(reopened_root) if item.property('text') in ['Analyze / reset preview','Hold / free time…']]
show_row(reopened_root,0)

# Custom templates retain native keyboard behavior under either host style.
# Host-yellow palette colors must not leak into tabs, checked controls, text
# selection, popup highlights, or the primary action.
options_tab=next(item for item in quick_descendants(reopened_root) if item.metaObject().className().startswith('BlueTabButton') and item.property('text')=='Export options')
preview_tab=next(item for item in quick_descendants(reopened_root) if item.metaObject().className().startswith('BlueTabButton') and item!=options_tab)
key_click(options_tab,timing_window,Qt.Key_Space)
assert reopened_root.findChild(QObject,'tabs').property('currentIndex')==0
assert_blue_controls(reopened_root)
assert_scrollbar_geometry(reopened_root)
full_checkbox=reopened_root.findChild(QObject,'fullMet')
key_click(full_checkbox,timing_window,Qt.Key_Space)
assert full_checkbox.property('checked') is False and reopened_root.property('validationError')
key_click(full_checkbox,timing_window,Qt.Key_Space)
assert full_checkbox.property('checked') is True and not reopened_root.property('validationError')
straight_radio=option_by_text(reopened_root,'Straight')
accent_radio=option_by_text(reopened_root,'Accents')
key_click(straight_radio,timing_window,Qt.Key_Space)
assert straight_radio.property('checked') is True and accent_radio.property('checked') is False
key_click(accent_radio,timing_window,Qt.Key_Space)
assert accent_radio.property('checked') is True and straight_radio.property('checked') is False
range_combo=reopened_root.findChild(QObject,'rangeMode')
key_click(range_combo,timing_window,Qt.Key_Space)
popup=qml_object(range_combo,'popup')
assert popup.property('visible') is True
QTest.keyClick(timing_window,Qt.Key_Down); app.processEvents()
assert range_combo.property('highlightedIndex')==1
highlighted=[item for item in quick_descendants(popup.property('contentItem')) if item.property('highlighted') is True]
assert highlighted,'Keyboard did not highlight a dropdown item'
assert all(color_name(item.property('background').property('color'))=='#1976d2' for item in highlighted)
save_screenshot(timing_window,'dropdown-ui')
QTest.keyClick(timing_window,Qt.Key_Escape); app.processEvents()
assert popup.property('visible') is False and range_combo.property('currentIndex')==0
key_click(preview_tab,timing_window,Qt.Key_Space)
assert reopened_root.findChild(QObject,'tabs').property('currentIndex')==1
choice=timing_control(reopened_root,2,'timingChoice')
key_click(choice,timing_window,Qt.Key_Space)
assert qml_object(choice,'popup').property('visible') is True
QTest.keyClick(timing_window,Qt.Key_Down); QTest.keyClick(timing_window,Qt.Key_Return); app.processEvents()
assert choice.property('currentIndex')==1 and reopened_root.property('timingPendingCount')==1
key_click(choice,timing_window,Qt.Key_Space)
QTest.keyClick(timing_window,Qt.Key_Up); QTest.keyClick(timing_window,Qt.Key_Return); app.processEvents()
assert choice.property('currentIndex')==0 and reopened_root.property('timingPendingCount')==2
export_button=next(item for item in quick_descendants(reopened_root) if item.metaObject().className().startswith('BlueButton') and item.property('text')=='Export…')
key_click(export_button,timing_window,Qt.Key_Space)
assert reopened_dialog.open_count==0
assert_blue_controls(reopened_root)
assert_scrollbar_geometry(reopened_root)
show_row(reopened_root,0)

def finish_checks():
    out=BASE/'tests/generated'; out.mkdir(exist_ok=True)
    save_screenshot(window,'preview-ui')
    root.findChild(QObject,'tabs').setProperty('currentIndex',0)
    app.processEvents()
    QTest.qWait(50)
    assert_blue_controls(root)
    assert_scrollbar_geometry(root)
    save_screenshot(window,'options-ui')
    (out/'UI-test.tetmetgroup').write_text(xml,encoding='utf8')
    for destination,text in version_xml: Path(destination).write_text(text,encoding='utf8')
    for destination,text in group_version_xml: Path(destination).write_text(text,encoding='utf8')
    save_screenshot(group_window,'grouping-ui')
    (out/'UI-Timing.tetmetgroup').write_text(timing_xml,encoding='utf8')
    save_screenshot(timing_window,'timing-ui')
    rendered_text=[item for item in quick_descendants(reopened_root) if isinstance(item.property('text'),str)]
    pickup_labels=[item for item in rendered_text if item.property('text').startswith('Actual length: 1 quarter-note count') and item.property('visible')]
    assert pickup_labels,'The pickup length must be visible in the real preview delegate'
    footer_labels=[item for item in rendered_text if item.property('text')=='Developed by Skyeler Robinson' or item.property('text').startswith('Report bugs:')]
    assert len(footer_labels)==2
    for label in footer_labels:
        position=label.mapToScene(QPointF(0,0))
        assert label.property('visible') and label.property('height')>0
        assert position.y()>=0 and position.y()+label.property('height')<=timing_window.height(),label.property('text')
    assert not [m for m in messages if 'ReferenceError' in m or 'TypeError' in m or 'Unable to assign' in m or 'binding loop' in m.lower()],messages
    print('PASS: Qt 6.10.2 '+HOST_STYLE+(' with yellow host palette' if YELLOW_HOST else '')+'; blue keyboard controls, scrollbar geometry, live options, raw range validation, focused grouping/count edits, inline hold/free-time decisions, repeat decisions, pickups, retained edits, /8 grouping, three-file exports, canceled/failed saves, Scores path and preferences work with API doubles.')
    QTimer.singleShot(250, app.quit)
def finish():
    try: finish_checks()
    except BaseException:
        traceback.print_exc()
        app.exit(1)
QTimer.singleShot(500,finish)
sys.exit(app.exec())
