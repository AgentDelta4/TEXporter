import QtQuick
import QtQuick.Templates as T

T.ComboBox {
    id: control
    property color accentColor: "#1976d2"
    implicitWidth: Math.max(140, implicitContentWidth + leftPadding + rightPadding)
    implicitHeight: 40
    padding: 8
    leftPadding: mirrored ? 32 : 10
    rightPadding: mirrored ? 10 : 32
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5
    contentItem: Text {
        text: control.displayText
        font: control.font
        color: control.palette.buttonText
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
    indicator: Item {
        width: 14
        height: 10
        x: control.mirrored ? 10 : control.width - width - 10
        y: (control.height - height) / 2
        Rectangle { x: 1; y: 3; width: 8; height: 2; rotation: 45; color: control.accentColor }
        Rectangle { x: 6; y: 3; width: 8; height: 2; rotation: -45; color: control.accentColor }
    }
    background: Rectangle {
        radius: 4
        color: control.down ? control.palette.mid : control.palette.button
        border.width: control.visualFocus ? 2 : 1
        border.color: control.visualFocus || control.hovered || control.down ? control.accentColor : control.palette.mid
    }
    delegate: T.ItemDelegate {
        id: choice
        required property int index
        required property var modelData
        width: control.width - 2
        implicitHeight: 38
        padding: 8
        text: control.textRole ? String(modelData[control.textRole]) : String(modelData)
        highlighted: control.highlightedIndex === index
        hoverEnabled: true
        contentItem: Text {
            text: choice.text
            font: control.font
            color: choice.highlighted ? "white" : control.palette.text
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        background: Rectangle {
            radius: 3
            color: choice.highlighted ? control.accentColor : control.palette.base
        }
    }
    popup: T.Popup {
        y: control.height + 2
        width: control.width
        height: Math.min(300, contentItem.implicitHeight + topPadding + bottomPadding)
        padding: 1
        closePolicy: T.Popup.CloseOnEscape | T.Popup.CloseOnPressOutsideParent
        contentItem: ListView {
            clip: true
            implicitHeight: contentHeight
            model: control.popup.visible ? control.delegateModel : null
            currentIndex: control.highlightedIndex
            highlightMoveDuration: 0
            boundsBehavior: Flickable.StopAtBounds
            T.ScrollBar.vertical: BlueScrollBar { accentColor: control.accentColor }
        }
        background: Rectangle { radius: 4; color: control.palette.base; border.color: control.accentColor }
    }
}
