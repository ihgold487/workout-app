import React, { useState } from "react"

export default function WeightPickerModal({
  isOpen,
  onClose,
  value,
  onSelect,
  weightUnit
}) {

  if (!isOpen) {
    return null
  }

  const increment =
    weightUnit === "kg"
      ? 1
      : 2.5

  const current =
    Number(value) || 0
    
    const [manualValue, setManualValue] = useState(String(current))

  const options = []

    for (
      let value = current - (20 * increment);
      value <= current + (20 * increment);
      value += increment
    ) {

      options.push(
        Number(
          value.toFixed(2)
        )
      )

    }

  return (

    <div
      onClick={onClose}
      style={{
        position:"fixed",
        inset:0,
        background:"rgba(0,0,0,0.4)",
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
        zIndex:1000
      }}
    >

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:"#fff",
          padding:"16px",
          borderRadius:"8px",
          minWidth:"220px"
        }}
      >

        <div
          style={{
            fontWeight:"bold",
            marginBottom:"12px"
          }}
        >
          Select Weight
        </div>
        
        <div
          style={{
            textAlign:"center",
            fontSize:"12px",
            color:"#666",
            marginBottom:"8px"
          }}
        >
          Scroll or tap a value
        </div>

        <div
          style={{
            maxHeight:"320px",
            overflowY:"auto",
            border:"1px solid #ddd",
            padding:"4px"
          }}
        >

          {
            options.map(
              option => (

                <button
                  key={option}

                  onClick={() => {

                    setManualValue(
                      String(option)
                    )

                  }}

                  style={{

                    display:"block",

                    width:"100%",

                    padding:"6px",

                    border:"none",

                    background:"transparent",

                    fontWeight:
                      Number(manualValue) === option
                        ? "bold"
                        : "normal",

                    fontSize:
                      Number(manualValue) === option
                        ? "24px"
                        : "16px",

                    opacity:
                      Number(manualValue) === option
                        ? 1
                        : 0.6

                  }}
                >
                  {
                    option
                  }
                </button>

              )
            )
          }

        </div>

        <div
          style={{
            display:"flex",
            alignItems:"center",
            justifyContent:"space-between",
            marginTop:"12px"
          }}
        >

          <button
            onClick={onClose}
            style={{
              border:"none",
              background:"transparent",
              fontSize:"28px"
            }}
          >
            ❌
          </button>

          <input

            inputMode="decimal"

            value={manualValue}

            onChange={e =>
              setManualValue(
                e.target.value
              )
            }

            style={{
              width:"90px",
              textAlign:"center",
              fontSize:"22px",
              fontWeight:"bold"
            }}

          />

          <button

            onClick={() => {

              const weight =
                Number(
                  manualValue
                )

              if (
                !isNaN(weight)
              ) {

                onSelect(weight)

              }

              onClose()

            }}

            style={{
              border:"none",
              background:"transparent",
              fontSize:"28px"
            }}

          >
            ✅
          </button>

        </div>
      </div>

    </div>

  )

}