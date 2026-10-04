import QtQuick
import QtQuick.Controls
import "ui" as Blue
import QtQuick.Layouts
import MuseScore 3.0
import FileIO 3.0
import "lib/ScoreReader.js" as Reader
import "lib/Model.js" as Model
import "lib/RepeatOrder.js" as Playback
import "lib/TonalEnergy.js" as TE
import "lib/Template.js" as Template
import "lib/ExportPath.js" as ExportPath
import "lib/ExportOptions.js" as Options
import "lib/Range.js" as Range
import "lib/Preview.js" as Preview
import "lib/Preflight.js" as Preflight

MuseScore {
    id: root
    title: "TEXporter — Export to TonalEnergy"
    description: "Export score ranges, editable presets, click count-ins and gradual tempo changes"
    version: "1.7.1"
    categoryCode: "playback"
    pluginType: "dialog"
    requiresScore: true
    width: 1000
    height: 760
    readonly property color accentColor: "#1976d2"
    readonly property string repositoryUrl: "https://github.com/AgentDelta4/TEXporter"

    property var analysis: null
    property var regions: []
    property var playbackMeasures: []
    property var exportRegions: []
    property var analysisWarnings: []
    property int writtenCount: 0
    property int measureCount: 1
    property int editRevision: 0
    property bool loading: true
    property bool ready: false
    property string pendingXml: ""
    property var pendingExports: []
    property var exportQueue: []
    property var exportedFiles: []
    property int exportIndex: 0
    property bool exporting: false
    property string exportFolder: ""
    property string exportSummary: ""
    property string fileError: ""
    property string validationError: ""
    property string summary: ""
    property string warningsText: ""
    property var selectedBounds: null
    property var selectedWritten: []
    property var allVisits: []
    property var timingDecisions: ({})
    property var userEdits: ({})
    property var queuedEdits: ({})
    property var rangeInputs: ({first:null,last:null})
    property bool updatingPreview: false
    property bool analyzing: false
    property var attentionItems: []
    property bool attentionExpanded: false
    property string timingError: ""
    property int timingPendingCount: 0
    readonly property int attentionCount: attentionItems.length

    Settings { id: museSettings; objectName: "museSettings" }
    Settings { id: preferences; objectName: "preferences"; category: "TEExporter" }
    ListModel { id: rows; objectName: "presetRows" }
    ListModel { id: timingRows; objectName: "timingRows" }
    FileIO { id: outputFile; objectName: "outputFile"; onError: function(msg) { root.fileError = msg } }
    Timer { id: previewTimer; objectName: "previewTimer"; interval: 150; repeat: false; onTriggered: root.reanalyzePreview() }

    function options() {
        return {combine: splitMode.currentIndex === 0 ? combine.checked : true,
            splitBy: ["settings", "rehearsal", "double"][splitMode.currentIndex],
            repeatMode: repeatMode.currentIndex === 0 ? "follow" : "ignore",
            readTempo: tempos.checked, readMeter: meters.checked, readRamps: ramps.checked,
            accentMode: downbeat.checked ? "downbeat" : "straight", debug: debug.checked,
            countInEnabled: countIn.checked, fullMet: fullMet.checked,
            halfMet: halfMet.checked, downbeatMet: downbeatMet.checked}
    }
    function restoreOptions() {
        preferences.sync()
        var o = Options.decode(preferences.value("options", ""))
        splitMode.currentIndex = ["settings", "rehearsal", "double"].indexOf(o.splitBy)
        repeatMode.currentIndex = o.repeatMode === "follow" ? 0 : 1
        combine.checked = o.combine
        tempos.checked = o.readTempo; meters.checked = o.readMeter; ramps.checked = o.readRamps
        downbeat.checked = o.accentMode === "downbeat"; straight.checked = !downbeat.checked
        debug.checked = o.debug
        countIn.checked = o.countInEnabled
        fullMet.checked = o.fullMet; halfMet.checked = o.halfMet; downbeatMet.checked = o.downbeatMet
    }
    function saveOptions() {
        preferences.setValue("options", Options.encode(options()))
        preferences.sync()
    }
    function outputChanged() {
        if (loading || exporting) return
        saveOptions()
        if (!updatingPreview) refresh()
    }
    function changed() {
        if (loading || exporting || analyzing) return
        saveOptions()
        if (!updatingPreview) queuedEdits = previewEdits()
        updatingPreview = true; pendingXml = ""; pendingExports = []
        validationError = rangeError(); summary = validationError.length ? "Check the range." : "Updating preview…"
        previewTimer.restart()
    }
    function reanalyzePreview() {
        previewTimer.stop()
        var edits = queuedEdits
        queuedEdits = ({}); updatingPreview = false
        return analyze(true, edits)
    }
    function rangeError() {
        if (rangeMode.currentIndex !== 2) return ""
        for (var key in rangeInputs) {
            var text = rangeInputs[key]
            if (text !== null && (!/^\d+$/.test(String(text).trim()) || Number(text) < 1 || Number(text) > measureCount))
                return (key === "first" ? "First" : "Last") + " bar must be an integer from 1 to " + measureCount + "."
        }
        if (firstBar.value > lastBar.value) return "First bar must not come after last bar."
        return ""
    }
    function rangeInputEdited(key, text) {
        if (loading || analyzing || exporting) return
        var next = JSON.parse(JSON.stringify(rangeInputs)); next[key] = String(text); rangeInputs = next
        changed()
    }
    function rangeValueModified(key, value) {
        if (loading || analyzing || exporting) return
        var next = JSON.parse(JSON.stringify(rangeInputs)); next[key] = String(value); rangeInputs = next
        changed()
    }
    function countUnit(base, count) {
        return ({1:"whole-note",2:"half-note",4:"quarter-note",8:"eighth-note",16:"16th-note",32:"32nd-note",64:"64th-note"})[base] + (Number(count) === 1 ? " count" : " counts")
    }
    function populateTimingRows(measures) {
        timingRows.clear()
        var required = Preflight.requirements(measures, selectedBounds)
        for (var i = 0; i < required.length; ++i) {
            var item = required[i], source = null
            for (var j = 0; j < measures.length; ++j)
                if (measures[j].index === item.measureIndex) { source = measures[j]; break }
            var decision = timingDecisions[String(item.measureIndex)]
            if (decision && decision.mode === "counts" && decision.denominator !== undefined && decision.denominator !== source.denominator) {
                var converted = JSON.parse(JSON.stringify(timingDecisions))
                decision = {mode:"counts",counts:String(Number(decision.counts) * source.denominator / decision.denominator),denominator:source.denominator}
                converted[String(item.measureIndex)] = decision; timingDecisions = converted
            }
            var counts = source.durationQuarters === undefined ? source.numerator : source.durationQuarters * source.denominator / 4
            timingRows.append({barIndex:item.measureIndex,
                label:"m." + item.measureNumber + " (bar " + item.measureIndex + ") — " + item.description,
                description:item.description,
                mode:decision ? (decision.mode === "counts" ? 2 : 1) : 0,
                counts:decision && decision.counts !== undefined ? String(decision.counts) : String(Number(counts.toFixed(6))),
                unit:countUnit(source.denominator)})
        }
    }
    function regionKey(region) {
        return (region.sourceIndices || []).join(",") + ":" + region.startIndex + ":" + region.endIndex + ":" + region.visitNumber
    }
    function previewEdits() {
        return JSON.parse(JSON.stringify(userEdits))
    }
    function timingDetails(region) {
        var details = {timingBarIndex:-1,timingLabel:"",timingMode:0,timingCounts:"",timingUnit:"",timingIssue:""}
        for (var i = 0; i < timingRows.count; ++i) {
            var timing = timingRows.get(i)
            if ((region.sourceIndices || []).indexOf(timing.barIndex) < 0) continue
            details = {timingBarIndex:timing.barIndex,timingLabel:timing.description,timingMode:timing.mode,
                timingCounts:timing.counts,timingUnit:timing.unit,timingIssue:""}
            var measure = null
            for (var m = 0; m < selectedWritten.length; ++m)
                if (selectedWritten[m].index === timing.barIndex) measure = selectedWritten[m]
            try { Preflight.applyDecisions([measure], timingDecisions) }
            catch (error) { details.timingIssue = timing.mode === 0 ? "Choose handling before exporting." : error.message }
            break
        }
        return details
    }
    function rebuildPreview(preserveEdits, savedEdits, inPlace) {
        var edits = savedEdits || (preserveEdits ? previewEdits() : {})
        // An unresolved choice may be previewed in steady time, but never saved.
        var previewChoices = JSON.parse(JSON.stringify(timingDecisions))
        var required = Preflight.requirements(selectedWritten)
        for (var q = 0; q < required.length; ++q) {
            var key = String(required[q].measureIndex), choice = previewChoices[key]
            var measure = analysis.measures[required[q].measureIndex - 1]
            for (var sm = 0; sm < selectedWritten.length; ++sm)
                if (selectedWritten[sm].index === required[q].measureIndex) measure = selectedWritten[sm]
            try {
                if (!choice || ["steady","counts"].indexOf(choice.mode) < 0) throw new Error("Unresolved")
                if (choice.mode === "counts") Preflight.countDuration(measure, choice.counts)
            } catch (error) { previewChoices[key] = {mode:"steady"} }
        }
        var selected = Preflight.applyDecisions(selectedWritten, previewChoices)
        playbackMeasures = Range.selectVisits(allVisits, selectedBounds, selected)
        var nextRegions = Model.regions(playbackMeasures, options()), entries = [], sameRows = !!inPlace && rows.count === nextRegions.length
        for (var i = 0; i < nextRegions.length; ++i) {
            var entry = Preview.edit(nextRegions[i]), previous = edits[regionKey(nextRegions[i])]
            if (previous) for (var key in previous)
                if (!(entry.isDurationSpecific && ["bars","meterTop","meterBase"].indexOf(key) >= 0)) entry[key] = previous[key]
            var timing = timingDetails(nextRegions[i])
            for (var role in timing) entry[role] = timing[role]
            entries.push(entry)
            if (!regions[i] || regionKey(regions[i]) !== regionKey(nextRegions[i])) sameRows = false
        }
        regions = nextRegions
        if (sameRows) {
            for (var rowIndex = 0; rowIndex < entries.length; ++rowIndex)
                for (var field in entries[rowIndex])
                    if (rows.get(rowIndex)[field] !== entries[rowIndex][field]) rows.setProperty(rowIndex,field,entries[rowIndex][field])
        } else {
            rows.clear()
            for (var r = 0; r < entries.length; ++r) rows.append(entries[r])
        }
        ready = true; editRevision++
        return refresh()
    }
    function checkTiming() {
        timingError = ""; timingPendingCount = 0
        var required = Preflight.requirements(selectedWritten)
        for (var i = 0; i < required.length; ++i) {
            var measure = null
            for (var m = 0; m < selectedWritten.length; ++m)
                if (selectedWritten[m].index === required[i].measureIndex) measure = selectedWritten[m]
            try { Preflight.applyDecisions([measure], timingDecisions) }
            catch (error) { timingPendingCount++; if (!timingError) timingError = error.message }
        }
    }
    function updateAttention(serializerWarnings) {
        var currentOptions = options()
        attentionItems = Preflight.collect(analysis, selectedBounds, exportRegions, serializerWarnings || []).filter(function(item) {
            return !(!currentOptions.readTempo && (item.kind === "tempo" || item.kind === "ramp")) &&
                !(!currentOptions.readMeter && item.kind === "meter")
        })
        warningsText = attentionItems.map(function(item) { return item.message }).join("\n")
        checkTiming()
    }
    function setTimingDecision(barIndex, mode, counts) {
        if (exporting || !analysis) return
        if (updatingPreview) reanalyzePreview()
        var next = JSON.parse(JSON.stringify(timingDecisions)), key = String(barIndex)
        var denominator = analysis.measures[barIndex-1].denominator
        for (var m = 0; m < selectedWritten.length; ++m)
            if (selectedWritten[m].index === barIndex) denominator = selectedWritten[m].denominator
        if (mode === 0) delete next[key]
        else next[key] = {mode:mode === 1 ? "steady" : "counts",counts:String(counts),denominator:denominator}
        timingDecisions = next
        populateTimingRows(selectedWritten)
        if (selectedWritten.length && allVisits.length) rebuildPreview(true, null, true)
        else checkTiming()
    }
    function editedRegions() {
        var parts = []
        for (var i = 0; i < rows.count; ++i) {
            try { parts.push(Preview.apply(regions[i], rows.get(i))) }
            catch (error) { throw new Error("Preset " + (i+1) + ": " + error.message) }
        }
        return parts
    }
    function refresh() {
        if (updatingPreview) return false
        var rangeIssue = rangeError()
        if (rangeIssue.length) { pendingXml = ""; pendingExports = []; validationError = rangeIssue; return false }
        if (!ready) return false
        try {
            exportRegions = editedRegions()
            pendingExports = TE.serializeExports(profile.text, exportRegions, options(), Template.defaults)
            pendingXml = pendingExports[0].text; validationError = ""
            var seconds = 0, bars = 0
            for (var i = 0; i < exportRegions.length; ++i) {
                seconds += Preview.duration(exportRegions[i])
                bars += exportRegions[i].barCount
            }
            summary = bars + " bars · " + exportRegions.length + " presets · ≈ " + seconds.toFixed(1) + " s · " + pendingExports.length + (pendingExports.length === 1 ? " file" : " files")
            updateAttention(pendingExports[0].warnings)
            if (timingPendingCount) summary += " · " + timingPendingCount + (timingPendingCount === 1 ? " timing choice needed" : " timing choices needed")
            return true
        } catch (error) {
            pendingXml = ""; pendingExports = []; validationError = error.message
            updateAttention([])
            return false
        }
    }
    function editRow(index, key, value) {
        if (exporting || !regions[index]) return
        rows.setProperty(index, key, value)
        var next = previewEdits(), identity = regionKey(regions[index])
        if (!next[identity]) next[identity] = {}
        next[identity][key] = value; userEdits = next
        if (updatingPreview) queuedEdits = previewEdits()
        editRevision++
        refresh()
    }
    function rowDuration(index) {
        var revision = editRevision
        try { return "≈ " + Preview.duration(Preview.apply(regions[index], rows.get(index))).toFixed(1) + " s" }
        catch (error) { return "Check values" }
    }
    function analyze(preserveEdits, savedEdits) {
        var rangeIssue = rangeError()
        if (rangeIssue.length) { pendingXml = ""; pendingExports = []; validationError = rangeIssue; summary = "Check the range."; return false }
        savedEdits = savedEdits || (preserveEdits ? previewEdits() : {})
        if (!preserveEdits) userEdits = ({})
        analyzing = true
        ready = false; pendingXml = ""; pendingExports = []; rows.clear(); regions = []; exportRegions = []
        selectedWritten = []; allVisits = []; analysis = null; selectedBounds = null; validationError = ""
        timingRows.clear(); timingError = ""; timingPendingCount = 0; attentionItems = []
        try {
            var o = options()
            analysis = Reader.read(curScore, Element, Segment, division,
                {splitBy:o.splitBy,readTempo:true,readMeter:true,readRamps:o.readTempo && o.readRamps}, BarLineType, LayoutBreak, Beam, SymId)
            measureCount = Math.max(1, analysis.measures.length)
            var bounds = Range.bounds(analysis.measures, ["all", "selection", "range"][rangeMode.currentIndex],
                firstBar.value, lastBar.value, analysis.selection)
            selectedBounds = bounds
            populateTimingRows(analysis.measures)
            selectedWritten = Range.selectWritten(analysis.measures, bounds, o)
            populateTimingRows(selectedWritten)
            var playback = Playback.expand(analysis.measures, o, analysis.navigation)
            allVisits = playback.measures
            writtenCount = selectedWritten.length
            analysisWarnings = analysis.warnings.concat(playback.warnings)
            var valid = rebuildPreview(false, savedEdits)
            if (debug.checked) console.log(JSON.stringify({score:analysis, playback:playbackMeasures, regions:regions}, null, 2))
            return valid
        } catch (error) {
            validationError = "Analysis failed: " + error.message
            summary = "Correct the options or score to update the preview."
            updateAttention([]); attentionExpanded = true
            return false
        } finally { analyzing = false }
    }
    function showTimingIssue() {
        tabs.currentIndex = 1
        for (var i = 0; i < rows.count; ++i) if (rows.get(i).timingIssue.length) {
            var first = i
            table.positionViewAtIndex(first, ListView.Contain)
            Qt.callLater(function() { var item = table.itemAtIndex(first); if (item) item.focusTiming() })
            return
        }
    }
    function exportFile() {
        if (exporting) return
        var rangeIssue = rangeError()
        if (rangeIssue.length) {
            pendingXml = ""; pendingExports = []; validationError = rangeIssue
            tabs.currentIndex = 0
            var field = rangeIssue.indexOf("Last bar") === 0 ? lastBar : firstBar
            Qt.callLater(function() { field.contentItem.forceActiveFocus() })
            return
        }
        if (updatingPreview && !reanalyzePreview()) return
        if (!ready && !analyze(true)) return
        if (!refresh()) { tabs.currentIndex = 1; return }
        if (timingError.length) { showTimingIssue(); return }
        try {
            museSettings.sync()
            exportFolder = ExportPath.localPath(museSettings.value("application/paths/myScores", ""))
            ExportPath.scoresFilePath(exportFolder, pendingExports[0].filename)
            exportQueue = pendingExports.slice(); exportedFiles = []; exportIndex = 0
            exportSummary = summary; exporting = true
            openNextExport()
        } catch (error) { validationError = "Export failed: " + error.message }
    }
    function openNextExport() {
        if (!exporting) return
        try {
            var item = exportQueue[exportIndex]
            saveDialog.title = "Save " + item.label + " (" + (exportIndex+1) + "/" + exportQueue.length + ")"
            saveDialog.folder = ExportPath.scoresFilePath(exportFolder, item.filename)
            saveDialog.open()
        } catch (error) { exporting = false; validationError = "Export failed: " + error.message }
    }
    function finishExport(message) {
        exporting = false
        summary = message + (exportedFiles.length ? "\n" + exportedFiles.join("\n") : "") + "\n" + exportSummary
    }
    function saveExport(destination) {
        if (!exporting) return
        try {
            destination = TE.validatePath(destination)
            for (var i = 0; i < exportedFiles.length; ++i) {
                var previous = ExportPath.localPath(exportedFiles[i]), chosen = ExportPath.localPath(destination)
                if (/^(?:[A-Za-z]:|\/\/)/.test(chosen)) { previous = previous.toLowerCase(); chosen = chosen.toLowerCase() }
                if (previous === chosen) throw new Error("Each met version needs a different filename.")
            }
            var item = exportQueue[exportIndex]
            outputFile.source = destination; fileError = ""
            if (!outputFile.write(item.text))
                throw new Error(fileError || "File write failed. Choose the configured Scores folder.")
            if (!TE.matchesReadback(outputFile.read(), item.text))
                throw new Error("The saved file did not match the generated XML. Check the destination and retry.")
            exportedFiles = exportedFiles.concat([destination]); exportIndex++
            validationError = ""
            if (exportIndex === exportQueue.length) {
                finishExport("Exported " + exportedFiles.length + (exportedFiles.length === 1 ? " group." : " groups."))
            } else {
                exportFolder = ExportPath.localPath(destination).replace(/\/[^/]*$/, "")
                summary = "Saved " + item.label + ". Choose a destination for " + exportQueue[exportIndex].label + "."
                // The native save picker is synchronous. Let its accepted callback
                // return before opening the next one, retaining overwrite prompts.
                Qt.callLater(root.openNextExport)
            }
        } catch (error) {
            validationError = "Export failed: " + error.message
            finishExport("Export stopped: " + exportedFiles.length + " of " + exportQueue.length + " groups saved.")
        }
    }
    onRun: {
        restoreOptions()
        if (!curScore || mscoreMajorVersion !== 4 || mscoreMinorVersion < 7) {
            validationError = "Open a score in MuseScore Studio 4.7 or later in the 4.x series."
            loading = false
            return
        }
        profile.text = curScore.title || curScore.metaTag("workTitle") || curScore.scoreName || "Untitled score"
        var count = 0
        for (var m = curScore.firstMeasure; m; m = m.nextMeasure) count++
        measureCount = Math.max(1, count); lastBar.value = measureCount
        loading = false
        analyze()
    }
    FileDialog {
        id: saveDialog
        objectName: "saveDialog"
        type: FileDialog.Save
        title: "Save TonalEnergy group (.tetmetgroup)"
        onAccepted: root.saveExport(filePath)
        onRejected: { if (root.exporting) root.finishExport("Export canceled: " + root.exportedFiles.length + " of " + root.exportQueue.length + " groups saved.") }
    }
    ColumnLayout {
        id: contentLayout
        palette.highlight: root.accentColor
        palette.highlightedText: "#ffffff"
        palette.link: root.accentColor
        anchors.fill: parent
        anchors.margins: 18
        spacing: 10
        RowLayout {
            Layout.fillWidth: true
            spacing: 12
            Image {
                source: "assets/tex-logo.png"
                Layout.preferredWidth: 52
                Layout.preferredHeight: 52
                fillMode: Image.PreserveAspectFit
                smooth: true
            }
            ColumnLayout {
                spacing: 1
                Label { text: "TEXporter"; font.pixelSize: 24; font.bold: true }
                Label { text: "Score to TonalEnergy"; font.pixelSize: 13; opacity: 0.75 }
            }
            Item { Layout.fillWidth: true }
        }
        RowLayout {
            Layout.fillWidth: true
            Label { text: "Profile name:" }
            Blue.BlueTextField { id: profile; Layout.fillWidth: true; selectByMouse: true; enabled: !root.exporting; onTextEdited: root.refresh() }
        }
        Blue.BlueTabBar {
            id: tabs
            enabled: !root.exporting
            objectName: "tabs"
            Layout.fillWidth: true
            Blue.BlueTabButton { text: "Export options" }
            Blue.BlueTabButton { text: "Editable preview (" + rows.count + ")" }
        }
        StackLayout {
            currentIndex: tabs.currentIndex
            Layout.fillWidth: true
            Layout.fillHeight: true
            ScrollView {
                id: optionsScroll
                clip: true
                ScrollBar.vertical: Blue.BlueScrollBar {
                    parent: optionsScroll
                    x: optionsScroll.mirrored ? 0 : optionsScroll.width - width
                    y: optionsScroll.topPadding
                    height: optionsScroll.availableHeight
                    active: optionsScroll.ScrollBar.horizontal.active
                }
                ScrollBar.horizontal: Blue.BlueScrollBar {
                    parent: optionsScroll
                    x: optionsScroll.leftPadding
                    y: optionsScroll.height - height
                    width: optionsScroll.availableWidth
                    active: optionsScroll.ScrollBar.vertical.active
                }
                Flickable {
                    contentHeight: settingsColumn.implicitHeight
                    contentWidth: width
                    clip: true
                    ColumnLayout {
                        id: settingsColumn
                        enabled: !root.exporting
                        width: parent.width
                        spacing: 4
                        RowLayout {
                            Label { text: "Export range:" }
                            Blue.BlueComboBox {
                                id: rangeMode
                                objectName: "rangeMode"
                                model: ["Whole score", "MuseScore selection", "Measure range"]
                                onCurrentIndexChanged: root.changed()
                            }
                            Label { text: "First bar:"; visible: rangeMode.currentIndex === 2 }
                            Blue.BlueSpinBox { id: firstBar; objectName: "firstBar"; from: 1; to: root.measureCount; value: 1; editable: true; visible: rangeMode.currentIndex === 2; onValueModified: root.rangeValueModified("first",value); onTextEdited: function(text) { root.rangeInputEdited("first",text) } }
                            Label { text: "Last bar:"; visible: rangeMode.currentIndex === 2 }
                            Blue.BlueSpinBox { id: lastBar; objectName: "lastBar"; from: 1; to: root.measureCount; value: 1; editable: true; visible: rangeMode.currentIndex === 2; onValueModified: root.rangeValueModified("last",value); onTextEdited: function(text) { root.rangeInputEdited("last",text) } }
                        }
                        RowLayout {
                            Label { text: "Export versions:" }
                            Blue.BlueCheckBox { id: fullMet; objectName: "fullMet"; text: "Full Met"; checked: true; onCheckedChanged: root.outputChanged() }
                            Blue.BlueCheckBox { id: halfMet; objectName: "halfMet"; text: "Half-note Met"; onCheckedChanged: root.outputChanged() }
                            Blue.BlueCheckBox { id: downbeatMet; objectName: "downbeatMet"; text: "Downbeat Met"; onCheckedChanged: root.outputChanged() }
                        }
                        RowLayout {
                            Label { text: "Click style:" }
                            Blue.BlueRadioButton { id: straight; text: "Straight"; onCheckedChanged: root.outputChanged() }
                            Blue.BlueRadioButton { id: downbeat; text: "Accents"; checked: true; onCheckedChanged: root.outputChanged() }
                        }
                        RowLayout {
                            Label { text: "Split presets by:" }
                            Blue.BlueComboBox { id: splitMode; Layout.preferredWidth: 230; model: ["Tempo / meter changes", "Rehearsal markings", "Double barlines"]; onCurrentIndexChanged: { if (!root.loading) { if (currentIndex !== 0) combine.checked = true; root.changed() } } }
                            Label { text: "Repeat handling:" }
                            Blue.BlueComboBox { id: repeatMode; Layout.preferredWidth: 200; model: ["Follow score repeats", "Ignore repeats"]; onCurrentIndexChanged: root.changed() }
                        }
                        Blue.BlueCheckBox { id: combine; text: "Combine matching measures"; checked: true; enabled: splitMode.currentIndex === 0; onCheckedChanged: root.changed() }
                        Blue.BlueCheckBox { id: tempos; text: "Tempo changes"; checked: true; onCheckedChanged: root.changed() }
                        Blue.BlueCheckBox { id: meters; text: "Meter changes"; checked: true; onCheckedChanged: root.changed() }
                        Blue.BlueCheckBox { id: ramps; text: "Accelerando / ritardando"; checked: true; enabled: tempos.checked; onCheckedChanged: root.changed() }
                        Blue.BlueCheckBox { id: countIn; objectName: "countIn"; text: "8-count count-in (Range Start)"; checked: true; onCheckedChanged: root.outputChanged() }
                        Blue.BlueCheckBox { id: debug; text: "Debug log"; onCheckedChanged: root.changed() }
                    }
                }
            }
            ColumnLayout {
                RowLayout {
                    Label { text: "Preset name"; Layout.preferredWidth: 190 }
                    Label { text: "Source"; Layout.preferredWidth: 100 }
                    Label { text: "Bars"; Layout.preferredWidth: 65 }
                    Label { text: "Meter"; Layout.preferredWidth: 100 }
                    Label { text: "Start BPM"; Layout.preferredWidth: 95 }
                    Label { text: "End BPM"; Layout.preferredWidth: 95 }
                    Label { text: "Duration" }
                }
                ListView {
                    id: table
                    objectName: "presetTable"
                    enabled: !root.exporting
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    spacing: 8
                    model: rows
                    ScrollBar.vertical: Blue.BlueScrollBar {}
                    delegate: Item {
                        id: row
                        required property int index
                        required property string name
                        required property string source
                        required property string bars
                        required property string meterTop
                        required property string meterBase
                        required property string startTempo
                        required property string endTempo
                        required property bool rampEnabled
                        required property string rampStart
                        required property string rampLength
                        required property string grouping
                        required property bool isDurationSpecific
                        required property string actualCounts
                        required property int timingBarIndex
                        required property string timingLabel
                        required property int timingMode
                        required property string timingCounts
                        required property string timingUnit
                        required property string timingIssue
                        function focusTiming() { if (timingMode === 2) rowTimingCounts.forceActiveFocus(); else rowTimingChoice.forceActiveFocus() }
                        width: table.width - 18
                        height: rowContents.implicitHeight
                        ColumnLayout {
                            id: rowContents
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.top: parent.top
                            spacing: 4
                            RowLayout {
                                Blue.BlueTextField { Layout.preferredWidth: 190; text: row.name; placeholderText: "Unnamed"; selectByMouse: true; onTextEdited: root.editRow(row.index,"name",text) }
                                Label { Layout.preferredWidth: 100; text: row.source }
                                Blue.BlueTextField { Layout.preferredWidth: 65; text: row.bars; enabled: !row.isDurationSpecific; inputMethodHints: Qt.ImhDigitsOnly; selectByMouse: true; onTextEdited: root.editRow(row.index,"bars",text) }
                                RowLayout {
                                    Layout.preferredWidth: 100
                                    Blue.BlueTextField { Layout.preferredWidth: 42; text: row.meterTop; enabled: !row.isDurationSpecific; selectByMouse: true; onTextEdited: root.editRow(row.index,"meterTop",text) }
                                    Label { text: "/" }
                                    Blue.BlueTextField { Layout.preferredWidth: 42; text: row.meterBase; enabled: !row.isDurationSpecific; selectByMouse: true; onTextEdited: root.editRow(row.index,"meterBase",text) }
                                }
                                Blue.BlueTextField { Layout.preferredWidth: 95; text: row.startTempo; inputMethodHints: Qt.ImhFormattedNumbersOnly; selectByMouse: true; onTextEdited: root.editRow(row.index,"startTempo",text) }
                                Blue.BlueTextField { Layout.preferredWidth: 95; text: row.endTempo; enabled: row.rampEnabled; inputMethodHints: Qt.ImhFormattedNumbersOnly; selectByMouse: true; onTextEdited: root.editRow(row.index,"endTempo",text) }
                                Label { text: root.rowDuration(row.index) }
                            }
                            RowLayout {
                                Blue.BlueCheckBox { text: "Gradual tempo"; checked: row.rampEnabled; onClicked: root.editRow(row.index,"rampEnabled",checked) }
                                Label { text: "Start offset (quarter beats):"; enabled: row.rampEnabled }
                                Blue.BlueTextField { Layout.preferredWidth: 65; text: row.rampStart; enabled: row.rampEnabled; selectByMouse: true; onTextEdited: root.editRow(row.index,"rampStart",text) }
                                Label { text: "Transition length (quarter beats):"; enabled: row.rampEnabled }
                                Blue.BlueTextField { Layout.preferredWidth: 65; text: row.rampLength; enabled: row.rampEnabled; selectByMouse: true; onTextEdited: root.editRow(row.index,"rampLength",text) }
                                Item { Layout.fillWidth: true }
                            }
                            RowLayout {
                                visible: Number(row.meterBase) === 8
                                Label { text: "Grouping:" }
                                Blue.BlueTextField { objectName: "groupingField"; Layout.preferredWidth: 160; text: row.grouping; placeholderText: "Full eighth clicks"; selectByMouse: true; onTextEdited: root.editRow(row.index,"grouping",text) }
                                Item { Layout.fillWidth: true }
                            }
                            Label { visible: row.isDurationSpecific; text: "Actual length: " + row.actualCounts + " " + root.countUnit(Number(row.meterBase),row.actualCounts); font.pixelSize: 12 }
                            RowLayout {
                                visible: row.timingBarIndex > 0
                                Label { text: row.timingLabel + ":"; font.bold: true; font.pixelSize: 12 }
                                Blue.BlueComboBox {
                                    id: rowTimingChoice
                                    objectName: "timingChoice"
                                    Layout.preferredWidth: 210
                                    model: ["Choose handling…", "Keep steady clicks", "Set total counts"]
                                    currentIndex: row.timingMode
                                    onActivated: root.setTimingDecision(row.timingBarIndex,currentIndex,row.timingCounts)
                                }
                                Blue.BlueTextField {
                                    id: rowTimingCounts
                                    objectName: "timingCounts"
                                    Layout.preferredWidth: 75
                                    visible: row.timingMode === 2
                                    text: row.timingCounts
                                    selectByMouse: true
                                    inputMethodHints: Qt.ImhFormattedNumbersOnly
                                    onTextEdited: root.setTimingDecision(row.timingBarIndex,row.timingMode,text)
                                }
                                Label { visible: row.timingMode === 2; text: row.timingUnit + " total"; font.pixelSize: 12 }
                                Item { Layout.fillWidth: true }
                            }
                            Label { visible: row.timingIssue.length > 0; Layout.fillWidth: true; text: row.timingIssue; color: "#d9534f"; font.pixelSize: 12; wrapMode: Text.WordWrap }
                        }
                    }
                }
            }
        }
        Label { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: root.summary }
        Label { Layout.fillWidth: true; wrapMode: Text.WordWrap; visible: root.validationError.length > 0; text: root.validationError; color: "#d9534f" }
        Blue.BlueToolButton {
            objectName: "attentionToggle"
            Layout.fillWidth: true
            visible: root.attentionCount > 0
            text: (root.attentionExpanded ? "Hide " : "Show ") + "Needs attention (" + root.attentionCount + ")"
            onClicked: root.attentionExpanded = !root.attentionExpanded
        }
        ScrollView {
            id: attentionScroll
            Layout.fillWidth: true
            Layout.preferredHeight: 80
            visible: root.attentionExpanded && root.attentionCount > 0
            clip: true
            ScrollBar.vertical: Blue.BlueScrollBar {
                parent: attentionScroll
                x: attentionScroll.mirrored ? 0 : attentionScroll.width - width
                y: attentionScroll.topPadding
                height: attentionScroll.availableHeight
                active: attentionScroll.ScrollBar.horizontal.active
            }
            ScrollBar.horizontal: Blue.BlueScrollBar {
                parent: attentionScroll
                x: attentionScroll.leftPadding
                y: attentionScroll.height - height
                width: attentionScroll.availableWidth
                active: attentionScroll.ScrollBar.vertical.active
            }
            TextEdit {
                text: root.warningsText
                readOnly: true
                wrapMode: TextEdit.Wrap
                selectByMouse: true
                color: contentLayout.palette.text
                selectionColor: root.accentColor
                selectedTextColor: "white"
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Blue.BlueButton { text: "Cancel"; enabled: !root.exporting; onClicked: root.quit() }
            Item { Layout.fillWidth: true }
            Blue.BlueButton { text: "Export…"; primary: true; enabled: !root.exporting && !!curScore && mscoreMajorVersion === 4 && mscoreMinorVersion >= 7; onClicked: root.exportFile() }
        }
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 1
            color: contentLayout.palette.mid
        }
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Developed by Skyeler Robinson"; font.pixelSize: 12 }
                Label { text: "· Code written by AI"; font.pixelSize: 12 }
                Item { Layout.fillWidth: true }
                Label { text: "TEXporter v" + root.version; font.pixelSize: 12; opacity: 0.75 }
            }
            Label {
                Layout.fillWidth: true
                text: 'Report bugs: <a href="https://www.instagram.com/skyelerrobinson__percussion/">Instagram @skyelerrobinson__percussion</a> · <a href="mailto:sr.percussion@icloud.com">sr.percussion@icloud.com</a>'
                textFormat: Text.StyledText
                wrapMode: Text.WordWrap
                font.pixelSize: 12
                linkColor: root.accentColor
                onLinkActivated: function(link) { Qt.openUrlExternally(link) }
            }
            Label {
                Layout.fillWidth: true
                text: 'GitHub: <a href="' + root.repositoryUrl + '">Repository</a> · <a href="' + root.repositoryUrl + '/releases/latest">Download latest</a> · <a href="' + root.repositoryUrl + '/issues/new/choose">Report a bug</a>'
                textFormat: Text.StyledText
                wrapMode: Text.WordWrap
                font.pixelSize: 13
                color: contentLayout.palette.text
                linkColor: root.accentColor
                onLinkActivated: function(link) { Qt.openUrlExternally(link) }
            }
        }
    }
}
