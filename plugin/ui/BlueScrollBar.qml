import QtQuick
import QtQuick.Templates as T

T.ScrollBar {
    id: control
    property color accentColor: "#1976d2"
    implicitWidth: vertical ? 12 : 80
    implicitHeight: vertical ? 80 : 12
    padding: 2
    minimumSize: 0.05
    hoverEnabled: true
    visible: policy !== T.ScrollBar.AlwaysOff && (policy === T.ScrollBar.AlwaysOn || size < 1)
    opacity: policy === T.ScrollBar.AlwaysOn || active || hovered || pressed ? 1 : 0.3
    contentItem: Rectangle {
        radius: 4
        color: control.pressed || control.hovered ? control.accentColor : control.palette.mid
    }
    background: Rectangle {
        radius: 4
        color: control.palette.base
        opacity: control.hovered || control.pressed ? 1 : 0.5
    }
}
