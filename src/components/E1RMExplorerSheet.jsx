import React from "react"

export default function E1RMExplorerModal({
  isOpen,
  onClose,
  setData
}) {

  if (!isOpen) return null

  return (

    <div
      style={{
        position:"fixed",
        inset:0,
        background:"rgba(0,0,0,0.5)",
        display:"flex",
        alignItems:"flex-end",
        justifyContent:"center",
        zIndex:2000
      }}
      onClick={onClose}
    >

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:"#fff",
          width:"100%",
          maxWidth:"500px",
          borderTopLeftRadius:"16px",
          borderTopRightRadius:"16px",
          padding:"16px",
          boxSizing:"border-box"
        }}
      >

        <div
          style={{
            fontSize:"18px",
            fontWeight:"bold",
            marginBottom:"12px"
          }}
        >
          e1RM Explorer
        </div>

        <div>

          Current Set

        </div>

        <div
          style={{
            marginTop:"8px",
            fontWeight:"bold"
          }}
        >
          {
            setData
              ? `${setData.weight}×${setData.reps}@${setData.rir}`
              : ""
          }
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop:"16px"
          }}
        >
          Close
        </button>

      </div>

    </div>

  )

}